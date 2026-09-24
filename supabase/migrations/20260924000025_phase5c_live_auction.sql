-- Phase 5C: transactional, least-privilege live auction foundation.

--------------------------------------------------------------------------------
-- 1. NORMALIZED A/B/C PRICE CONFIGURATION + LEGACY-SAFE BACKFILL
--------------------------------------------------------------------------------
CREATE TABLE public.tournament_auction_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  category_code text NOT NULL CHECK (category_code IN ('A','B','C')),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 80),
  base_price numeric(12,2) NOT NULL CHECK (base_price > 0),
  display_order integer NOT NULL CHECK (display_order IN (1,2,3)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, category_code),
  UNIQUE (tournament_id, display_order),
  UNIQUE (tournament_id, id),
  CHECK ((category_code='A' AND display_order=1) OR (category_code='B' AND display_order=2) OR (category_code='C' AND display_order=3))
);

INSERT INTO public.tournament_auction_categories(tournament_id,category_code,display_name,base_price,display_order)
SELECT s.tournament_id,x.code,'Category '||x.code,s.auction_base_price,x.ord
FROM public.tournament_settings s
JOIN public.tournaments t ON t.id=s.tournament_id
CROSS JOIN (VALUES('A',1),('B',2),('C',3)) x(code,ord)
WHERE t.format='LEAGUE' AND t.league_mode='AUCTION' AND COALESCE(s.auction_base_price,0)>0;

ALTER TABLE public.player_tournament_registrations ADD COLUMN auction_price_category_id uuid;
ALTER TABLE public.player_tournament_registrations ADD CONSTRAINT registration_auction_price_category_fk
  FOREIGN KEY (tournament_id,auction_price_category_id)
  REFERENCES public.tournament_auction_categories(tournament_id,id);

-- Existing approved auction-routed players are assigned the compatibility C
-- tier. All seeded tiers equal the legacy price, so behavior is preserved.
UPDATE public.player_tournament_registrations r
SET auction_price_category_id=c.id
FROM public.tournament_settings s, public.tournament_auction_categories c
WHERE s.tournament_id=r.tournament_id AND c.tournament_id=r.tournament_id AND c.category_code='C'
  AND r.status='APPROVED'
  AND (r.auction_category='MAIN_AUCTION'
    OR (r.auction_category='ICON_LOT' AND s.icon_selection_method='AUCTION')
    OR (r.auction_category='SETTER_LOT' AND s.setter_selection_method='AUCTION'));

ALTER TABLE public.tournament_auction_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tournament members can read auction categories" ON public.tournament_auction_categories FOR SELECT USING (public.is_tournament_member(tournament_id));

--------------------------------------------------------------------------------
-- 2. AUTHORITATIVE STATE, QUEUE, IDEMPOTENCY, AND SAFE EVENTS
--------------------------------------------------------------------------------
ALTER TABLE public.auctions
  ADD COLUMN state_version bigint NOT NULL DEFAULT 1 CHECK (state_version > 0),
  ADD COLUMN event_sequence bigint NOT NULL DEFAULT 0 CHECK (event_sequence >= 0),
  ADD COLUMN minimum_acquisition_reserve_price numeric(12,2),
  ADD COLUMN prepared_at timestamptz,
  ADD COLUMN paused_at timestamptz;

UPDATE public.auctions a SET minimum_acquisition_reserve_price=(SELECT min(c.base_price) FROM public.tournament_auction_categories c WHERE c.tournament_id=a.tournament_id);
ALTER TABLE public.auctions ADD CONSTRAINT auctions_reserve_price_positive CHECK (minimum_acquisition_reserve_price IS NULL OR minimum_acquisition_reserve_price>0);

ALTER TABLE public.auction_players
  ADD COLUMN original_base_price numeric(12,2),
  ADD COLUMN auction_price_category_id uuid,
  ADD COLUMN category_code text CHECK (category_code IN ('A','B','C')),
  ADD COLUMN category_label text,
  ADD COLUMN category_base_price numeric(12,2) CHECK (category_base_price IS NULL OR category_base_price>0),
  ADD COLUMN attempt_number integer NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
  ADD COLUMN state_version bigint NOT NULL DEFAULT 1 CHECK (state_version > 0),
  ADD COLUMN live_started_at timestamptz,
  ADD COLUMN terminal_at timestamptz;

UPDATE public.auction_players
SET original_base_price = base_price,
    auction_order = row_number
FROM (
  SELECT id, row_number() OVER (PARTITION BY auction_id ORDER BY auction_order NULLS LAST, created_at, id)::integer AS row_number
  FROM public.auction_players
) ordered
WHERE ordered.id = auction_players.id;

UPDATE public.auction_players ap
SET auction_price_category_id=c.id, category_code=c.category_code,
    category_label=c.display_name, category_base_price=c.base_price
FROM public.auctions a
JOIN public.player_tournament_registrations r ON r.tournament_id=a.tournament_id
JOIN public.tournament_auction_categories c ON c.tournament_id=r.tournament_id AND c.id=r.auction_price_category_id
WHERE a.id=ap.auction_id AND r.player_id=ap.player_id;

ALTER TABLE public.auction_players ADD CONSTRAINT auction_player_category_same_tournament_fk
  FOREIGN KEY (auction_price_category_id) REFERENCES public.tournament_auction_categories(id);

ALTER TABLE public.auction_players
  ALTER COLUMN original_base_price SET NOT NULL,
  ALTER COLUMN auction_order SET NOT NULL,
  ADD CONSTRAINT auction_players_order_positive CHECK (auction_order > 0),
  ADD CONSTRAINT auction_players_original_price_nonnegative CHECK (original_base_price >= 0);

CREATE UNIQUE INDEX auction_players_cycle_order_unique
  ON public.auction_players (auction_id, attempt_number, auction_order);

ALTER TABLE public.auction_bids DROP CONSTRAINT auction_bids_idempotency_key_key;
ALTER TABLE public.auction_bids ALTER COLUMN idempotency_key SET NOT NULL;
ALTER TABLE public.auction_bids
  ADD COLUMN expected_player_version bigint NOT NULL DEFAULT 1 CHECK (expected_player_version > 0);
CREATE UNIQUE INDEX auction_bids_request_unique
  ON public.auction_bids (auction_id, idempotency_key);

ALTER TABLE public.purse_transactions
  ADD CONSTRAINT purse_transactions_purchase_sale_required
  CHECK (transaction_type <> 'PURCHASE' OR auction_sale_id IS NOT NULL);
CREATE UNIQUE INDEX purse_transactions_one_purchase_per_sale
  ON public.purse_transactions (auction_sale_id) WHERE transaction_type = 'PURCHASE';

CREATE TABLE public.auction_operation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid NOT NULL REFERENCES public.auctions(id) ON DELETE CASCADE,
  operation text NOT NULL CHECK (operation IN ('START','PAUSE','RESUME','NEXT_PLAYER','SOLD','UNSOLD','REQUEUE','PRICE_CHANGE','COMPLETE')),
  request_key text NOT NULL CHECK (length(btrim(request_key)) BETWEEN 1 AND 200),
  request_fingerprint jsonb NOT NULL,
  result jsonb,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auction_id, operation, request_key)
);

CREATE TABLE public.auction_public_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid NOT NULL REFERENCES public.auctions(id) ON DELETE CASCADE,
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  sequence_number bigint NOT NULL CHECK (sequence_number > 0),
  event_type text NOT NULL CHECK (event_type IN (
    'AUCTION_PREPARED','AUCTION_STARTED','AUCTION_PAUSED','AUCTION_RESUMED',
    'PLAYER_OPENED','BID_ACCEPTED','PLAYER_SOLD','PLAYER_UNSOLD',
    'REAUCTION_PRICE_CHANGED','PLAYER_REQUEUED','AUCTION_COMPLETED'
  )),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auction_id, sequence_number)
);
CREATE INDEX auction_public_events_auction_sequence ON public.auction_public_events (auction_id, sequence_number);
ALTER TABLE public.auction_operation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_public_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read public auction events" ON public.auction_public_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_id AND t.is_public)
  OR public.is_tournament_member(tournament_id)
);

--------------------------------------------------------------------------------
-- 3. INTERNAL SECURITY AND INTEGRITY HELPERS
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_auction_player_price_floor()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.base_price<=0 THEN RAISE EXCEPTION 'Operational base price must be positive'; END IF;
  IF TG_OP='UPDATE' AND NEW.base_price IS DISTINCT FROM OLD.base_price
     AND (OLD.status='LIVE' OR EXISTS(SELECT 1 FROM public.auction_bids b WHERE b.auction_player_id=OLD.id)) THEN
    RAISE EXCEPTION 'Operational price is locked after the attempt becomes LIVE or receives a bid';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.auction_player_is_eligible(p_tournament_id uuid, p_player_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.player_tournament_registrations r
    JOIN public.tournament_settings s ON s.tournament_id = r.tournament_id
    WHERE r.tournament_id = p_tournament_id AND r.player_id = p_player_id AND r.status = 'APPROVED'
      AND (r.auction_category = 'MAIN_AUCTION'
        OR (r.auction_category = 'ICON_LOT' AND s.icon_selection_method = 'AUCTION')
        OR (r.auction_category = 'SETTER_LOT' AND s.setter_selection_method = 'AUCTION'))
      AND r.auction_price_category_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.tournament_auction_categories c WHERE c.id=r.auction_price_category_id AND c.tournament_id=r.tournament_id)
      AND NOT EXISTS (SELECT 1 FROM public.team_players tp WHERE tp.tournament_id=p_tournament_id AND tp.player_id=p_player_id AND tp.status='ACTIVE')
  );
$$;

CREATE OR REPLACE FUNCTION public.emit_auction_event(p_auction_id uuid, p_event_type text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_seq bigint; v_tournament uuid;
BEGIN
  UPDATE public.auctions SET event_sequence=event_sequence+1 WHERE id=p_auction_id
  RETURNING event_sequence,tournament_id INTO v_seq,v_tournament;
  IF v_tournament IS NULL THEN RAISE EXCEPTION 'Auction not found'; END IF;
  INSERT INTO public.auction_public_events(auction_id,tournament_id,sequence_number,event_type,payload)
  VALUES(p_auction_id,v_tournament,v_seq,p_event_type,COALESCE(p_payload,'{}'::jsonb));
  RETURN v_seq;
END;
$$;

CREATE OR REPLACE FUNCTION public.auction_team_finance(p_auction_id uuid, p_team_id uuid, p_purchase numeric DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_tournament uuid; v_remaining numeric; v_spent numeric; v_min integer; v_max integer; v_floor numeric; v_squad integer; v_missing integer; v_reserve numeric; v_max_bid numeric;
BEGIN
  SELECT a.tournament_id,w.remaining_balance,w.spent_amount,s.min_squad_size,s.max_squad_size,a.minimum_acquisition_reserve_price
  INTO v_tournament,v_remaining,v_spent,v_min,v_max,v_floor
  FROM public.auctions a JOIN public.auction_team_wallets w ON w.auction_id=a.id AND w.team_id=p_team_id
  JOIN public.tournament_settings s ON s.tournament_id=a.tournament_id WHERE a.id=p_auction_id;
  IF v_tournament IS NULL OR COALESCE(v_floor,0)<=0 THEN RAISE EXCEPTION 'Auction wallet/settings unavailable'; END IF;
  SELECT count(*) INTO v_squad FROM public.team_players WHERE tournament_id=v_tournament AND team_id=p_team_id AND status='ACTIVE';
  v_missing:=greatest(v_min-(v_squad+CASE WHEN p_purchase>0 THEN 1 ELSE 0 END),0);
  v_reserve:=v_missing*v_floor;
  v_max_bid:=v_remaining-v_reserve;
  RETURN jsonb_build_object('remaining',v_remaining,'spent',v_spent,'active_squad',v_squad,'minimum_squad',v_min,'maximum_squad',v_max,'reserve',v_reserve,'max_allowed_bid',v_max_bid);
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_auction_category_configuration()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_tournament uuid:=COALESCE(NEW.tournament_id,OLD.tournament_id);
BEGIN
  IF EXISTS(SELECT 1 FROM public.auctions a WHERE a.tournament_id=v_tournament AND (a.prepared_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.auction_players ap WHERE ap.auction_id=a.id))) THEN
    RAISE EXCEPTION 'Auction category configuration is locked after preparation';
  END IF;
  RETURN COALESCE(NEW,OLD);
END;
$$;
CREATE TRIGGER auction_category_configuration_lock BEFORE UPDATE OR DELETE ON public.tournament_auction_categories FOR EACH ROW EXECUTE FUNCTION public.protect_auction_category_configuration();

CREATE OR REPLACE FUNCTION public.update_auction_price_categories(
  p_tournament_id uuid,
  p_a_name text,p_a_price numeric,
  p_b_name text,p_b_price numeric,
  p_c_name text,p_c_price numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_t public.tournaments%ROWTYPE; v_before jsonb; v_after jsonb;
BEGIN
  SELECT * INTO v_t FROM public.tournaments WHERE id=p_tournament_id FOR UPDATE;
  IF v_t.id IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v_t.format<>'LEAGUE' OR v_t.league_mode<>'AUCTION' THEN RAISE EXCEPTION 'Price categories require an Auction League tournament'; END IF;
  IF p_a_price IS NULL OR p_b_price IS NULL OR p_c_price IS NULL OR p_a_price<p_b_price OR p_b_price<p_c_price OR p_c_price<=0 THEN RAISE EXCEPTION 'Category prices must satisfy A >= B >= C > 0'; END IF;
  IF length(btrim(COALESCE(p_a_name,''))) NOT BETWEEN 1 AND 80 OR length(btrim(COALESCE(p_b_name,''))) NOT BETWEEN 1 AND 80 OR length(btrim(COALESCE(p_c_name,''))) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Category display names are required and limited to 80 characters'; END IF;
  IF EXISTS(SELECT 1 FROM public.auctions a WHERE a.tournament_id=p_tournament_id AND (a.prepared_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.auction_players ap WHERE ap.auction_id=a.id))) THEN RAISE EXCEPTION 'Auction category configuration is locked after preparation'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.display_order),'[]') INTO v_before FROM public.tournament_auction_categories c WHERE c.tournament_id=p_tournament_id;
  INSERT INTO public.tournament_auction_categories(tournament_id,category_code,display_name,base_price,display_order) VALUES
    (p_tournament_id,'A',btrim(p_a_name),p_a_price,1),(p_tournament_id,'B',btrim(p_b_name),p_b_price,2),(p_tournament_id,'C',btrim(p_c_name),p_c_price,3)
  ON CONFLICT(tournament_id,category_code) DO UPDATE SET display_name=EXCLUDED.display_name,base_price=EXCLUDED.base_price,updated_at=now();
  SELECT jsonb_agg(to_jsonb(c) ORDER BY c.display_order) INTO v_after FROM public.tournament_auction_categories c WHERE c.tournament_id=p_tournament_id;
  INSERT INTO public.audit_logs(tournament_id,user_id,action,entity_type,entity_id,before_json,after_json) VALUES(p_tournament_id,auth.uid(),'AUCTION_PRICE_CATEGORIES_UPDATED','tournament_auction_categories',p_tournament_id,v_before,v_after);
  RETURN jsonb_build_object('ok',true,'categories',v_after,'reserve_floor',least(p_a_price,p_b_price,p_c_price));
END;
$$;

DROP FUNCTION public.approve_player_registration(uuid,text,text);
CREATE FUNCTION public.approve_player_registration(p_registration_id uuid,p_auction_category text DEFAULT NULL,p_notes text DEFAULT NULL,p_auction_price_category_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE r public.player_tournament_registrations%ROWTYPE; t public.tournaments%ROWTYPE; s public.tournament_settings%ROWTYPE; required boolean; v_lock jsonb;
BEGIN
  SELECT * INTO r FROM public.player_tournament_registrations WHERE id=p_registration_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Registration not found'; END IF;
  SELECT * INTO t FROM public.tournaments WHERE id=r.tournament_id; SELECT * INTO s FROM public.tournament_settings WHERE tournament_id=r.tournament_id;
  IF NOT public.is_tournament_organizer(r.tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF r.status='APPROVED' AND r.auction_category IS NOT DISTINCT FROM p_auction_category AND r.auction_price_category_id IS NOT DISTINCT FROM p_auction_price_category_id THEN RETURN; END IF;
  IF r.status NOT IN('PENDING','CHANGES_REQUESTED','APPROVED') THEN RAISE EXCEPTION 'Cannot classify registration in current status'; END IF;
  IF r.status='APPROVED' AND r.auction_category IS DISTINCT FROM p_auction_category THEN
    IF EXISTS(SELECT 1 FROM public.team_players tp WHERE tp.tournament_id=r.tournament_id AND tp.player_id=r.player_id) THEN RAISE EXCEPTION 'Allocation classification is locked by downstream assignment'; END IF;
    IF r.auction_category IN('ICON_LOT','SETTER_LOT') THEN v_lock:=public.special_allocation_lock(r.tournament_id,r.auction_category); IF (v_lock->>'locked')::boolean THEN RAISE EXCEPTION '%',v_lock->>'reason'; END IF; END IF;
    IF p_auction_category IN('ICON_LOT','SETTER_LOT') THEN v_lock:=public.special_allocation_lock(r.tournament_id,p_auction_category); IF (v_lock->>'locked')::boolean THEN RAISE EXCEPTION '%',v_lock->>'reason'; END IF; END IF;
  END IF;
  IF t.format='LEAGUE' AND t.league_mode='AUCTION' THEN
    IF p_auction_category NOT IN('ICON_LOT','SETTER_LOT','MAIN_AUCTION') THEN RAISE EXCEPTION 'Allocation classification is required'; END IF;
    required:=p_auction_category='MAIN_AUCTION' OR (p_auction_category='ICON_LOT' AND s.icon_selection_method='AUCTION') OR (p_auction_category='SETTER_LOT' AND s.setter_selection_method='AUCTION');
    IF required AND p_auction_price_category_id IS NULL THEN RAISE EXCEPTION 'Auction price category is required'; END IF;
    IF NOT required AND p_auction_price_category_id IS NOT NULL THEN RAISE EXCEPTION 'Lot Draw routed player must not have an auction price category'; END IF;
    IF p_auction_price_category_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tournament_auction_categories c WHERE c.id=p_auction_price_category_id AND c.tournament_id=r.tournament_id) THEN RAISE EXCEPTION 'Auction price category belongs to another tournament'; END IF;
  ELSIF p_auction_category IS NOT NULL OR p_auction_price_category_id IS NOT NULL THEN RAISE EXCEPTION 'Auction classification is invalid for this tournament'; END IF;
  IF EXISTS(SELECT 1 FROM public.auctions a JOIN public.auction_players ap ON ap.auction_id=a.id WHERE a.tournament_id=r.tournament_id AND ap.player_id=r.player_id) THEN RAISE EXCEPTION 'Classification is locked after auction preparation'; END IF;
  UPDATE public.player_tournament_registrations SET status='APPROVED',auction_category=p_auction_category,auction_price_category_id=p_auction_price_category_id,review_notes=p_notes,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() WHERE id=r.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_registration_auction_price_category()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE s public.tournament_settings%ROWTYPE; routed boolean;
BEGIN
  SELECT * INTO s FROM public.tournament_settings WHERE tournament_id=NEW.tournament_id;
  routed:=NEW.auction_category='MAIN_AUCTION'
    OR (NEW.auction_category='ICON_LOT' AND s.icon_selection_method='AUCTION')
    OR (NEW.auction_category='SETTER_LOT' AND s.setter_selection_method='AUCTION');
  IF NEW.status='APPROVED' AND routed AND NEW.auction_price_category_id IS NULL THEN RAISE EXCEPTION 'Approved auction-routed player requires an auction price category'; END IF;
  IF NEW.auction_price_category_id IS NOT NULL AND NOT routed THEN RAISE EXCEPTION 'Lot Draw/non-auction player must not have an auction price category'; END IF;
  IF TG_OP='UPDATE' AND (NEW.auction_category IS DISTINCT FROM OLD.auction_category OR NEW.auction_price_category_id IS DISTINCT FROM OLD.auction_price_category_id)
    AND EXISTS(SELECT 1 FROM public.auctions a JOIN public.auction_players ap ON ap.auction_id=a.id WHERE a.tournament_id=NEW.tournament_id AND ap.player_id=NEW.player_id) THEN RAISE EXCEPTION 'Auction classification is locked after preparation'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER registration_auction_price_category_guard BEFORE INSERT OR UPDATE OF status,auction_category,auction_price_category_id ON public.player_tournament_registrations FOR EACH ROW EXECUTE FUNCTION public.validate_registration_auction_price_category();

CREATE OR REPLACE FUNCTION public.auction_request_begin(p_auction_id uuid,p_operation text,p_request_key text,p_fingerprint jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v public.auction_operation_requests%ROWTYPE;
BEGIN
  IF p_request_key IS NULL OR length(btrim(p_request_key)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'A non-empty request key is required'; END IF;
  SELECT * INTO v FROM public.auction_operation_requests WHERE auction_id=p_auction_id AND operation=p_operation AND request_key=p_request_key FOR UPDATE;
  IF v.id IS NOT NULL THEN
    IF v.request_fingerprint<>p_fingerprint THEN RAISE EXCEPTION 'Request key was already used with different content'; END IF;
    IF v.result IS NULL THEN RAISE EXCEPTION 'Request is already in progress'; END IF;
    RETURN v.result;
  END IF;
  INSERT INTO public.auction_operation_requests(auction_id,operation,request_key,request_fingerprint,created_by)
  VALUES(p_auction_id,p_operation,p_request_key,p_fingerprint,auth.uid());
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.auction_request_finish(p_auction_id uuid,p_operation text,p_request_key text,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public.auction_operation_requests SET result=p_result WHERE auction_id=p_auction_id AND operation=p_operation AND request_key=p_request_key;
  RETURN p_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_auction_integrity()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_tournament uuid;
BEGIN
  IF TG_TABLE_NAME='auction_team_wallets' THEN
    SELECT tournament_id INTO v_tournament FROM public.auctions WHERE id=NEW.auction_id;
    IF NOT EXISTS(SELECT 1 FROM public.teams WHERE id=NEW.team_id AND tournament_id=v_tournament AND status='ACTIVE') THEN RAISE EXCEPTION 'Wallet team must be active in auction tournament'; END IF;
    IF NEW.starting_balance<>NEW.spent_amount+NEW.remaining_balance THEN RAISE EXCEPTION 'Wallet balance invariant violated'; END IF;
  ELSIF TG_TABLE_NAME='auction_bids' THEN
    SELECT tournament_id INTO v_tournament FROM public.auctions WHERE id=NEW.auction_id;
    IF NOT EXISTS(SELECT 1 FROM public.auction_players WHERE id=NEW.auction_player_id AND auction_id=NEW.auction_id) THEN RAISE EXCEPTION 'Bid player belongs to another auction'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.teams WHERE id=NEW.team_id AND tournament_id=v_tournament AND status='ACTIVE') THEN RAISE EXCEPTION 'Bid team belongs to another tournament'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER auction_wallet_integrity_guard BEFORE INSERT OR UPDATE ON public.auction_team_wallets FOR EACH ROW EXECUTE FUNCTION public.enforce_auction_integrity();
CREATE TRIGGER auction_bid_integrity_guard BEFORE INSERT OR UPDATE ON public.auction_bids FOR EACH ROW EXECUTE FUNCTION public.enforce_auction_integrity();

CREATE OR REPLACE FUNCTION public.enforce_team_player_capacity_and_tournament()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_tournament uuid; v_team_status text; v_max integer; v_count integer;
BEGIN
  IF NEW.status<>'ACTIVE' THEN RETURN NEW; END IF;
  SELECT tournament_id,status INTO v_tournament,v_team_status FROM public.teams WHERE id=NEW.team_id FOR UPDATE;
  IF v_tournament IS NULL OR v_tournament<>NEW.tournament_id OR v_team_status<>'ACTIVE' THEN RAISE EXCEPTION 'Active roster assignment requires an active team in the same tournament'; END IF;
  SELECT max_squad_size INTO v_max FROM public.tournament_settings WHERE tournament_id=NEW.tournament_id;
  SELECT count(*) INTO v_count FROM public.team_players tp WHERE tp.tournament_id=NEW.tournament_id AND tp.team_id=NEW.team_id AND tp.status='ACTIVE' AND (TG_OP='INSERT' OR tp.id<>NEW.id);
  IF v_max IS NOT NULL AND v_count>=v_max THEN RAISE EXCEPTION 'Maximum squad size reached'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER team_player_capacity_tournament_guard BEFORE INSERT OR UPDATE OF tournament_id,team_id,status ON public.team_players FOR EACH ROW EXECUTE FUNCTION public.enforce_team_player_capacity_and_tournament();

--------------------------------------------------------------------------------
-- 4. READINESS AND INITIALIZATION
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_auction_readiness(p_tournament_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_t public.tournaments%ROWTYPE; v_s public.tournament_settings%ROWTYPE; v_blockers jsonb:='[]'; v_teams integer; v_eligible integer; v_capacity integer; v_needed integer; v_a uuid; v_cat_count integer; v_a_price numeric; v_b_price numeric; v_c_price numeric;
BEGIN
  SELECT * INTO v_t FROM public.tournaments WHERE id=p_tournament_id;
  SELECT * INTO v_s FROM public.tournament_settings WHERE tournament_id=p_tournament_id;
  IF v_t.id IS NULL THEN v_blockers:=v_blockers||'"TOURNAMENT_NOT_FOUND"';
  ELSE
    IF v_t.format<>'LEAGUE' THEN v_blockers:=v_blockers||'"NOT_LEAGUE"'; END IF;
    IF v_t.league_mode<>'AUCTION' THEN v_blockers:=v_blockers||'"NOT_AUCTION_MODE"'; END IF;
  END IF;
  IF v_s.tournament_id IS NULL OR COALESCE(v_s.auction_starting_purse,0)<=0 OR COALESCE(v_s.auction_base_price,0)<=0 OR COALESCE(v_s.auction_bid_increment,0)<=0 THEN v_blockers:=v_blockers||'"INVALID_PRICING"'; END IF;
  IF v_s.tournament_id IS NULL OR v_s.min_squad_size<=0 OR v_s.max_squad_size IS NULL OR v_s.max_squad_size<v_s.min_squad_size THEN v_blockers:=v_blockers||'"INVALID_SQUAD_LIMITS"'; END IF;
  SELECT count(*),max(base_price) FILTER(WHERE category_code='A'),max(base_price) FILTER(WHERE category_code='B'),max(base_price) FILTER(WHERE category_code='C') INTO v_cat_count,v_a_price,v_b_price,v_c_price FROM public.tournament_auction_categories WHERE tournament_id=p_tournament_id;
  IF v_cat_count<>3 OR v_a_price IS NULL OR v_b_price IS NULL OR v_c_price IS NULL THEN v_blockers:=v_blockers||'"MISSING_AUCTION_PRICE_CATEGORIES"';
  ELSIF v_a_price<v_b_price OR v_b_price<v_c_price OR v_c_price<=0 THEN v_blockers:=v_blockers||'"INVALID_AUCTION_PRICE_ORDER"'; END IF;
  SELECT count(*) INTO v_teams FROM public.teams WHERE tournament_id=p_tournament_id AND status='ACTIVE';
  IF v_teams=0 THEN v_blockers:=v_blockers||'"NO_ACTIVE_TEAMS"'; END IF;
  SELECT count(*) INTO v_eligible FROM public.player_tournament_registrations r WHERE r.tournament_id=p_tournament_id AND public.auction_player_is_eligible(p_tournament_id,r.player_id);
  IF v_eligible=0 THEN v_blockers:=v_blockers||'"NO_ELIGIBLE_PLAYERS"'; END IF;
  IF EXISTS(SELECT 1 FROM public.player_tournament_registrations r WHERE r.tournament_id=p_tournament_id AND r.status='APPROVED' AND (r.auction_category='MAIN_AUCTION' OR (r.auction_category='ICON_LOT' AND v_s.icon_selection_method='AUCTION') OR (r.auction_category='SETTER_LOT' AND v_s.setter_selection_method='AUCTION')) AND r.auction_price_category_id IS NULL) THEN v_blockers:=v_blockers||'"AUCTION_PLAYER_CATEGORY_MISSING"'; END IF;
  IF v_s.icon_selection_method='LOT_DRAW' AND EXISTS(SELECT 1 FROM public.player_tournament_registrations r WHERE r.tournament_id=p_tournament_id AND r.status='APPROVED' AND r.auction_category='ICON_LOT') AND NOT EXISTS(SELECT 1 FROM public.lot_sessions l WHERE l.tournament_id=p_tournament_id AND l.lot_type='ICON' AND l.status='COMPLETED') THEN v_blockers:=v_blockers||'"ICON_LOT_INCOMPLETE"'; END IF;
  IF v_s.setter_selection_method='LOT_DRAW' AND EXISTS(SELECT 1 FROM public.player_tournament_registrations r WHERE r.tournament_id=p_tournament_id AND r.status='APPROVED' AND r.auction_category='SETTER_LOT') AND NOT EXISTS(SELECT 1 FROM public.lot_sessions l WHERE l.tournament_id=p_tournament_id AND l.lot_type='SETTER' AND l.status='COMPLETED') THEN v_blockers:=v_blockers||'"SETTER_LOT_INCOMPLETE"'; END IF;
  SELECT COALESCE(sum(greatest(v_s.max_squad_size-x.c,0)),0),COALESCE(sum(greatest(v_s.min_squad_size-x.c,0)),0) INTO v_capacity,v_needed FROM (SELECT t.id,(SELECT count(*) FROM public.team_players tp WHERE tp.team_id=t.id AND tp.tournament_id=p_tournament_id AND tp.status='ACTIVE') c FROM public.teams t WHERE t.tournament_id=p_tournament_id AND t.status='ACTIVE') x;
  IF v_eligible>v_capacity THEN v_blockers:=v_blockers||'"INSUFFICIENT_TOTAL_CAPACITY"'; END IF;
  IF v_eligible<v_needed THEN v_blockers:=v_blockers||'"MINIMUM_SQUADS_UNREACHABLE"'; END IF;
  SELECT id INTO v_a FROM public.auctions WHERE tournament_id=p_tournament_id;
  IF v_a IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM public.auctions a WHERE a.id=v_a AND a.prepared_at IS NULL)
      AND (EXISTS(SELECT 1 FROM public.auction_team_wallets w WHERE w.auction_id=v_a)
        OR EXISTS(SELECT 1 FROM public.auction_players ap WHERE ap.auction_id=v_a)
        OR EXISTS(SELECT 1 FROM public.auction_bids b WHERE b.auction_id=v_a)) THEN v_blockers:=v_blockers||'"PARTIAL_OR_LEGACY_AUCTION_STATE"'; END IF;
    IF EXISTS(SELECT 1 FROM public.auctions a WHERE a.id=v_a AND a.prepared_at IS NOT NULL)
      AND (SELECT count(*) FROM public.auction_team_wallets w WHERE w.auction_id=v_a)<>v_teams THEN v_blockers:=v_blockers||'"PARTIAL_INITIALIZATION"'; END IF;
    IF EXISTS(SELECT 1 FROM public.auctions a WHERE a.id=v_a AND a.prepared_at IS NOT NULL AND a.minimum_acquisition_reserve_price IS DISTINCT FROM least(v_a_price,v_b_price,v_c_price)) THEN v_blockers:=v_blockers||'"PREPARED_CATEGORY_SNAPSHOT_CONFLICT"'; END IF;
    IF EXISTS(SELECT 1 FROM public.auction_team_wallets w JOIN public.teams t ON t.id=w.team_id WHERE w.auction_id=v_a AND (t.tournament_id<>p_tournament_id OR w.starting_balance<>w.spent_amount+w.remaining_balance)) THEN v_blockers:=v_blockers||'"WALLET_CONFLICT"'; END IF;
    IF (SELECT count(*) FROM public.auction_players WHERE auction_id=v_a AND status='LIVE')>1 THEN v_blockers:=v_blockers||'"LIVE_PLAYER_CONFLICT"'; END IF;
    IF EXISTS(SELECT 1 FROM public.auction_players WHERE auction_id=v_a GROUP BY attempt_number,auction_order HAVING count(*)>1) THEN v_blockers:=v_blockers||'"QUEUE_CONFLICT"'; END IF;
    IF EXISTS(SELECT 1 FROM public.auction_sales s JOIN public.auction_players ap ON ap.id=s.auction_player_id WHERE ap.auction_id=v_a AND (ap.status<>'SOLD' OR NOT EXISTS(SELECT 1 FROM public.auction_bids b WHERE b.id=s.winning_bid_id AND b.auction_player_id=ap.id AND b.team_id=s.team_id))) THEN v_blockers:=v_blockers||'"SALE_INTEGRITY_CONFLICT"'; END IF;
  END IF;
  RETURN jsonb_build_object('ready',jsonb_array_length(v_blockers)=0,'blockers',v_blockers,'active_teams',v_teams,'eligible_players',v_eligible,'remaining_capacity',v_capacity,'minimum_slots_needed',v_needed);
END;
$$;

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
    RETURN jsonb_build_object('auction_id',v_auction,'idempotent',true,'status',(SELECT status FROM public.auctions WHERE id=v_auction));
  END IF;
  IF v_auction IS NOT NULL AND (EXISTS(SELECT 1 FROM public.auction_team_wallets WHERE auction_id=v_auction) OR EXISTS(SELECT 1 FROM public.auction_players WHERE auction_id=v_auction) OR EXISTS(SELECT 1 FROM public.auction_bids WHERE auction_id=v_auction)) THEN RAISE EXCEPTION 'Partial or legacy auction state requires preflight resolution'; END IF;
  v_ready:=public.get_auction_readiness(p_tournament_id);
  IF NOT (v_ready->>'ready')::boolean THEN RAISE EXCEPTION 'Auction is not ready: %',v_ready->'blockers'; END IF;
  IF v_auction IS NULL THEN
    INSERT INTO public.auctions(tournament_id,starting_purse,minimum_bid_increment,minimum_acquisition_reserve_price,status,prepared_at)
    VALUES(p_tournament_id,v_s.auction_starting_purse,v_s.auction_bid_increment,v_reserve_floor,'READY',now()) RETURNING id INTO v_auction;
  ELSE UPDATE public.auctions SET starting_purse=v_s.auction_starting_purse,minimum_bid_increment=v_s.auction_bid_increment,minimum_acquisition_reserve_price=v_reserve_floor,status='READY',prepared_at=now(),state_version=state_version+1 WHERE id=v_auction; END IF;
  INSERT INTO public.auction_team_wallets(auction_id,team_id,starting_balance,remaining_balance)
  SELECT v_auction,t.id,v_s.auction_starting_purse,v_s.auction_starting_purse FROM public.teams t WHERE t.tournament_id=p_tournament_id AND t.status='ACTIVE';
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

--------------------------------------------------------------------------------
-- 4. LIFECYCLE AND QUEUE OPERATIONS
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_auction_lifecycle(p_auction_id uuid,p_action text,p_expected_version bigint,p_request_key text)
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
  UPDATE public.auctions SET status=v_new,state_version=state_version+1,started_at=CASE WHEN p_action='START' THEN now() ELSE started_at END,paused_at=CASE WHEN p_action='PAUSE' THEN now() ELSE NULL END WHERE id=p_auction_id RETURNING state_version INTO p_expected_version;
  PERFORM public.emit_auction_event(p_auction_id,v_event,'{}');
  INSERT INTO public.audit_logs(tournament_id,user_id,action,entity_type,entity_id) VALUES(v.tournament_id,auth.uid(),v_event,'auctions',p_auction_id);
  v_result:=jsonb_build_object('auction_id',p_auction_id,'status',v_new,'state_version',p_expected_version);
  RETURN public.auction_request_finish(p_auction_id,p_action,p_request_key,v_result);
END;
$$;

CREATE OR REPLACE FUNCTION public.open_next_auction_player(p_auction_id uuid,p_expected_version bigint,p_request_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v public.auctions%ROWTYPE; p public.auction_players%ROWTYPE; old jsonb; result jsonb;
BEGIN
  SELECT * INTO v FROM public.auctions WHERE id=p_auction_id FOR UPDATE;
  IF v.id IS NULL OR NOT public.is_tournament_organizer(v.tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  old:=public.auction_request_begin(p_auction_id,'NEXT_PLAYER',p_request_key,jsonb_build_object('expected_version',p_expected_version)); IF old IS NOT NULL THEN RETURN old; END IF;
  IF v.status<>'LIVE' OR v.state_version<>p_expected_version THEN RAISE EXCEPTION 'Auction is not LIVE or request is stale'; END IF;
  IF EXISTS(SELECT 1 FROM public.auction_players WHERE auction_id=p_auction_id AND status='LIVE') THEN RAISE EXCEPTION 'A player is already LIVE'; END IF;
  SELECT * INTO p FROM public.auction_players WHERE auction_id=p_auction_id AND status='WAITING' ORDER BY attempt_number,auction_order,id LIMIT 1 FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'No waiting player remains'; END IF;
  IF NOT public.auction_player_is_eligible(v.tournament_id,p.player_id) THEN RAISE EXCEPTION 'Next player is no longer eligible'; END IF;
  UPDATE public.auction_players SET status='LIVE',live_started_at=now(),terminal_at=NULL,state_version=state_version+1 WHERE id=p.id RETURNING * INTO p;
  UPDATE public.auctions SET state_version=state_version+1 WHERE id=p_auction_id RETURNING state_version INTO p_expected_version;
  PERFORM public.emit_auction_event(p_auction_id,'PLAYER_OPENED',jsonb_build_object('auction_player_id',p.id,'base_price',p.base_price,'attempt_number',p.attempt_number));
  INSERT INTO public.audit_logs(tournament_id,user_id,action,entity_type,entity_id,after_json) VALUES(v.tournament_id,auth.uid(),'AUCTION_PLAYER_LIVE','auction_players',p.id,jsonb_build_object('attempt_number',p.attempt_number));
  result:=jsonb_build_object('auction_player_id',p.id,'player_id',p.player_id,'base_price',p.base_price,'player_version',p.state_version,'auction_version',p_expected_version);
  RETURN public.auction_request_finish(p_auction_id,'NEXT_PLAYER',p_request_key,result);
END;
$$;

--------------------------------------------------------------------------------
-- 5. BIDDING AND TERMINAL OPERATIONS
--------------------------------------------------------------------------------
DROP FUNCTION public.place_auction_bid(uuid,uuid,uuid,numeric,text);
CREATE FUNCTION public.place_auction_bid(p_auction_id uuid,p_auction_player_id uuid,p_team_id uuid,p_amount numeric,p_request_key text,p_expected_player_version bigint,p_expected_highest_bid numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE a public.auctions%ROWTYPE; ap public.auction_players%ROWTYPE; t public.teams%ROWTYPE; w public.auction_team_wallets%ROWTYPE; prior public.auction_bids%ROWTYPE; highest numeric; next_bid numeric; finance jsonb; source text; bid_id uuid; result jsonb;
BEGIN
  IF p_request_key IS NULL OR btrim(p_request_key)='' THEN RAISE EXCEPTION 'A non-empty request key is required'; END IF;
  SELECT * INTO prior FROM public.auction_bids WHERE auction_id=p_auction_id AND idempotency_key=p_request_key;
  IF prior.id IS NOT NULL THEN
    IF prior.auction_player_id<>p_auction_player_id OR prior.team_id<>p_team_id OR prior.amount<>p_amount OR prior.expected_player_version<>p_expected_player_version THEN RAISE EXCEPTION 'Request key was already used with different content'; END IF;
    SELECT COALESCE(max(amount),0) INTO highest FROM public.auction_bids WHERE auction_player_id=p_auction_player_id;
    finance:=public.auction_team_finance(p_auction_id,p_team_id,0);
    RETURN jsonb_build_object('bid_id',prior.id,'amount',prior.amount,'highest_bid',highest,'leading_team_id',(SELECT team_id FROM public.auction_bids WHERE auction_player_id=p_auction_player_id ORDER BY amount DESC,created_at,id LIMIT 1),'next_minimum_bid',highest+(SELECT minimum_bid_increment FROM public.auctions WHERE id=p_auction_id),'remaining_purse',finance->'remaining','protected_reserve',finance->'reserve','max_allowed_bid',finance->'max_allowed_bid','player_version',prior.expected_player_version,'idempotent',true);
  END IF;
  SELECT * INTO a FROM public.auctions WHERE id=p_auction_id FOR UPDATE;
  IF a.id IS NULL OR a.status<>'LIVE' THEN RAISE EXCEPTION 'Auction is not LIVE'; END IF;
  -- Recheck after acquiring the auction serialization lock so concurrent retries
  -- reconstruct the committed response instead of reaching the unique index.
  SELECT * INTO prior FROM public.auction_bids WHERE auction_id=p_auction_id AND idempotency_key=p_request_key;
  IF prior.id IS NOT NULL THEN
    IF prior.auction_player_id<>p_auction_player_id OR prior.team_id<>p_team_id OR prior.amount<>p_amount OR prior.expected_player_version<>p_expected_player_version THEN RAISE EXCEPTION 'Request key was already used with different content'; END IF;
    SELECT COALESCE(max(amount),0) INTO highest FROM public.auction_bids WHERE auction_player_id=p_auction_player_id;
    finance:=public.auction_team_finance(p_auction_id,p_team_id,0);
    RETURN jsonb_build_object('bid_id',prior.id,'amount',prior.amount,'highest_bid',highest,'leading_team_id',(SELECT team_id FROM public.auction_bids WHERE auction_player_id=p_auction_player_id ORDER BY amount DESC,created_at,id LIMIT 1),'next_minimum_bid',highest+a.minimum_bid_increment,'remaining_purse',finance->'remaining','protected_reserve',finance->'reserve','max_allowed_bid',finance->'max_allowed_bid','player_version',prior.expected_player_version,'auction_version',a.state_version,'idempotent',true);
  END IF;
  SELECT * INTO ap FROM public.auction_players WHERE id=p_auction_player_id AND auction_id=p_auction_id FOR UPDATE;
  IF ap.id IS NULL OR ap.status<>'LIVE' OR ap.state_version<>p_expected_player_version THEN RAISE EXCEPTION 'Player state is stale or not LIVE'; END IF;
  SELECT * INTO t FROM public.teams WHERE id=p_team_id FOR UPDATE;
  IF t.id IS NULL OR t.tournament_id<>a.tournament_id OR t.status<>'ACTIVE' THEN RAISE EXCEPTION 'Team is not active in this tournament'; END IF;
  IF public.is_tournament_organizer(a.tournament_id) THEN source:='ORGANIZER';
  ELSIF EXISTS(SELECT 1 FROM public.team_owners o WHERE o.team_id=p_team_id AND o.user_id=auth.uid() AND o.status='ACTIVE') THEN source:='TEAM_OWNER';
  ELSE RAISE EXCEPTION 'Unauthorized to bid for this team'; END IF;
  SELECT * INTO w FROM public.auction_team_wallets WHERE auction_id=p_auction_id AND team_id=p_team_id FOR UPDATE;
  IF w.id IS NULL OR w.starting_balance<>w.spent_amount+w.remaining_balance THEN RAISE EXCEPTION 'Wallet is unavailable or inconsistent'; END IF;
  IF NOT public.auction_player_is_eligible(a.tournament_id,ap.player_id) THEN RAISE EXCEPTION 'Player is no longer eligible'; END IF;
  finance:=public.auction_team_finance(p_auction_id,p_team_id,p_amount);
  IF (finance->>'maximum_squad')::integer IS NOT NULL AND (finance->>'active_squad')::integer >= (finance->>'maximum_squad')::integer THEN RAISE EXCEPTION 'Maximum squad size reached'; END IF;
  SELECT COALESCE(max(amount),0) INTO highest FROM public.auction_bids WHERE auction_player_id=p_auction_player_id;
  IF highest<>COALESCE(p_expected_highest_bid,0) THEN RAISE EXCEPTION 'Current bid is stale'; END IF;
  next_bid:=CASE WHEN highest=0 THEN ap.base_price ELSE highest+a.minimum_bid_increment END;
  IF p_amount<next_bid THEN RAISE EXCEPTION 'Bid is below the required next bid'; END IF;
  IF p_amount>(finance->>'max_allowed_bid')::numeric THEN RAISE EXCEPTION 'Bid would violate protected minimum-squad purse'; END IF;
  INSERT INTO public.auction_bids(auction_id,auction_player_id,team_id,amount,source,idempotency_key,submitted_by,expected_player_version)
  VALUES(p_auction_id,p_auction_player_id,p_team_id,p_amount,source,p_request_key,auth.uid(),p_expected_player_version) RETURNING id INTO bid_id;
  PERFORM public.emit_auction_event(p_auction_id,'BID_ACCEPTED',jsonb_build_object('auction_player_id',p_auction_player_id,'team_id',p_team_id,'amount',p_amount));
  INSERT INTO public.audit_logs(tournament_id,user_id,action,entity_type,entity_id,after_json) VALUES(a.tournament_id,auth.uid(),'AUCTION_BID_PLACED','auction_bids',bid_id,jsonb_build_object('auction_player_id',p_auction_player_id,'team_id',p_team_id,'amount',p_amount));
  result:=jsonb_build_object('bid_id',bid_id,'amount',p_amount,'highest_bid',p_amount,'leading_team_id',p_team_id,'next_minimum_bid',p_amount+a.minimum_bid_increment,'remaining_purse',finance->'remaining','protected_reserve',finance->'reserve','max_allowed_bid',finance->'max_allowed_bid','player_version',ap.state_version,'auction_version',a.state_version,'idempotent',false);
  RETURN result;
END;
$$;

DROP FUNCTION public.finalize_auction_sale(uuid,uuid);
CREATE FUNCTION public.finalize_auction_sale(p_auction_id uuid,p_auction_player_id uuid,p_expected_player_version bigint,p_expected_winning_bid_id uuid,p_request_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE a public.auctions%ROWTYPE; ap public.auction_players%ROWTYPE; t public.teams%ROWTYPE; w public.auction_team_wallets%ROWTYPE; b public.auction_bids%ROWTYPE; old jsonb; finance jsonb; sale_id uuid; result jsonb;
BEGIN
  SELECT * INTO a FROM public.auctions WHERE id=p_auction_id FOR UPDATE;
  IF a.id IS NULL OR NOT public.is_tournament_organizer(a.tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  old:=public.auction_request_begin(p_auction_id,'SOLD',p_request_key,jsonb_build_object('player',p_auction_player_id,'version',p_expected_player_version,'bid',p_expected_winning_bid_id)); IF old IS NOT NULL THEN RETURN old; END IF;
  IF a.status<>'LIVE' THEN RAISE EXCEPTION 'Auction is not LIVE'; END IF;
  SELECT * INTO ap FROM public.auction_players WHERE id=p_auction_player_id AND auction_id=p_auction_id FOR UPDATE;
  IF ap.id IS NULL OR ap.status<>'LIVE' OR ap.state_version<>p_expected_player_version THEN RAISE EXCEPTION 'Player state is stale or not LIVE'; END IF;
  SELECT * INTO b FROM public.auction_bids WHERE auction_player_id=p_auction_player_id ORDER BY amount DESC,created_at,id LIMIT 1 FOR UPDATE;
  IF b.id IS NULL OR b.id<>p_expected_winning_bid_id THEN RAISE EXCEPTION 'Winning bid is stale or missing'; END IF;
  SELECT * INTO t FROM public.teams WHERE id=b.team_id FOR UPDATE;
  IF t.id IS NULL OR t.tournament_id<>a.tournament_id OR t.status<>'ACTIVE' THEN RAISE EXCEPTION 'Winning team is invalid'; END IF;
  SELECT * INTO w FROM public.auction_team_wallets WHERE auction_id=p_auction_id AND team_id=b.team_id FOR UPDATE;
  IF NOT public.auction_player_is_eligible(a.tournament_id,ap.player_id) THEN RAISE EXCEPTION 'Player is no longer eligible'; END IF;
  finance:=public.auction_team_finance(p_auction_id,b.team_id,b.amount);
  IF (finance->>'active_squad')::integer >= (finance->>'maximum_squad')::integer THEN RAISE EXCEPTION 'Maximum squad size reached'; END IF;
  IF b.amount>(finance->>'max_allowed_bid')::numeric THEN RAISE EXCEPTION 'Sale would violate protected minimum-squad purse'; END IF;
  INSERT INTO public.auction_sales(auction_player_id,team_id,winning_bid_id,sold_amount,confirmed_by) VALUES(ap.id,b.team_id,b.id,b.amount,auth.uid()) RETURNING id INTO sale_id;
  INSERT INTO public.team_players(tournament_id,team_id,player_id,acquisition_type,acquisition_amount,status) VALUES(a.tournament_id,b.team_id,ap.player_id,'AUCTION',b.amount,'ACTIVE');
  INSERT INTO public.purse_transactions(wallet_id,transaction_type,amount,balance_before,balance_after,player_id,auction_sale_id,created_by) VALUES(w.id,'PURCHASE',-b.amount,w.remaining_balance,w.remaining_balance-b.amount,ap.player_id,sale_id,auth.uid());
  UPDATE public.auction_team_wallets SET spent_amount=spent_amount+b.amount,remaining_balance=remaining_balance-b.amount,updated_at=now() WHERE id=w.id;
  UPDATE public.auction_players SET status='SOLD',terminal_at=now(),state_version=state_version+1 WHERE id=ap.id RETURNING state_version INTO p_expected_player_version;
  UPDATE public.auctions SET state_version=state_version+1 WHERE id=p_auction_id;
  PERFORM public.emit_auction_event(p_auction_id,'PLAYER_SOLD',jsonb_build_object('auction_player_id',ap.id,'player_id',ap.player_id,'team_id',b.team_id,'amount',b.amount));
  INSERT INTO public.audit_logs(tournament_id,user_id,action,entity_type,entity_id,after_json) VALUES(a.tournament_id,auth.uid(),'AUCTION_PLAYER_SOLD','auction_sales',sale_id,jsonb_build_object('player_id',ap.player_id,'team_id',b.team_id,'amount',b.amount));
  result:=jsonb_build_object('sale_id',sale_id,'auction_player_id',ap.id,'team_id',b.team_id,'amount',b.amount,'remaining_purse',w.remaining_balance-b.amount,'player_version',p_expected_player_version);
  RETURN public.auction_request_finish(p_auction_id,'SOLD',p_request_key,result);
END;
$$;

DROP FUNCTION public.mark_auction_player_unsold(uuid,uuid);
CREATE FUNCTION public.mark_auction_player_unsold(p_auction_id uuid,p_auction_player_id uuid,p_expected_player_version bigint,p_request_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE a public.auctions%ROWTYPE; ap public.auction_players%ROWTYPE; old jsonb; result jsonb;
BEGIN
  SELECT * INTO a FROM public.auctions WHERE id=p_auction_id FOR UPDATE;
  IF a.id IS NULL OR NOT public.is_tournament_organizer(a.tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  old:=public.auction_request_begin(p_auction_id,'UNSOLD',p_request_key,jsonb_build_object('player',p_auction_player_id,'version',p_expected_player_version)); IF old IS NOT NULL THEN RETURN old; END IF;
  IF a.status<>'LIVE' THEN RAISE EXCEPTION 'Auction is not LIVE'; END IF;
  SELECT * INTO ap FROM public.auction_players WHERE id=p_auction_player_id AND auction_id=p_auction_id FOR UPDATE;
  IF ap.id IS NULL OR ap.status<>'LIVE' OR ap.state_version<>p_expected_player_version THEN RAISE EXCEPTION 'Player state is stale or not LIVE'; END IF;
  IF EXISTS(SELECT 1 FROM public.auction_bids WHERE auction_player_id=ap.id) THEN RAISE EXCEPTION 'Player has accepted bids and must be sold'; END IF;
  UPDATE public.auction_players SET status='UNSOLD',terminal_at=now(),state_version=state_version+1 WHERE id=ap.id RETURNING state_version INTO p_expected_player_version;
  UPDATE public.auctions SET state_version=state_version+1 WHERE id=p_auction_id;
  PERFORM public.emit_auction_event(p_auction_id,'PLAYER_UNSOLD',jsonb_build_object('auction_player_id',ap.id,'player_id',ap.player_id));
  INSERT INTO public.audit_logs(tournament_id,user_id,action,entity_type,entity_id) VALUES(a.tournament_id,auth.uid(),'AUCTION_PLAYER_UNSOLD','auction_players',ap.id);
  result:=jsonb_build_object('auction_player_id',ap.id,'status','UNSOLD','player_version',p_expected_player_version);
  RETURN public.auction_request_finish(p_auction_id,'UNSOLD',p_request_key,result);
END;
$$;

--------------------------------------------------------------------------------
-- 6. REAUCTION AND COMPLETION
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_reauction_price(p_auction_id uuid,p_auction_player_id uuid,p_new_price numeric,p_expected_player_version bigint,p_request_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE a public.auctions%ROWTYPE; ap public.auction_players%ROWTYPE; rule text; old jsonb; result jsonb;
BEGIN
  SELECT * INTO a FROM public.auctions WHERE id=p_auction_id FOR UPDATE;
  IF a.id IS NULL OR NOT public.is_tournament_organizer(a.tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  old:=public.auction_request_begin(p_auction_id,'PRICE_CHANGE',p_request_key,jsonb_build_object('player',p_auction_player_id,'price',p_new_price,'version',p_expected_player_version)); IF old IS NOT NULL THEN RETURN old; END IF;
  SELECT * INTO ap FROM public.auction_players WHERE id=p_auction_player_id AND auction_id=p_auction_id FOR UPDATE;
  SELECT reauction_price_rule INTO rule FROM public.tournament_settings WHERE tournament_id=a.tournament_id;
  IF ap.status<>'UNSOLD' OR ap.state_version<>p_expected_player_version OR rule<>'ORGANIZER_SETS_PRICE' THEN RAISE EXCEPTION 'Reauction price cannot be changed'; END IF;
  IF p_new_price IS NULL OR p_new_price<=0 THEN RAISE EXCEPTION 'Operational reauction base price must be positive'; END IF;
  UPDATE public.auction_players SET base_price=p_new_price,state_version=state_version+1 WHERE id=ap.id RETURNING state_version INTO p_expected_player_version;
  PERFORM public.emit_auction_event(p_auction_id,'REAUCTION_PRICE_CHANGED',jsonb_build_object('auction_player_id',ap.id,'base_price',p_new_price));
  INSERT INTO public.audit_logs(tournament_id,user_id,action,entity_type,entity_id,before_json,after_json) VALUES(a.tournament_id,auth.uid(),'AUCTION_REAUCTION_PRICE_CHANGED','auction_players',ap.id,jsonb_build_object('base_price',ap.base_price),jsonb_build_object('base_price',p_new_price));
  result:=jsonb_build_object('auction_player_id',ap.id,'base_price',p_new_price,'player_version',p_expected_player_version);
  RETURN public.auction_request_finish(p_auction_id,'PRICE_CHANGE',p_request_key,result);
END;
$$;

CREATE OR REPLACE FUNCTION public.requeue_auction_player(p_auction_id uuid,p_auction_player_id uuid,p_expected_player_version bigint,p_request_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE a public.auctions%ROWTYPE; ap public.auction_players%ROWTYPE; rule text; old jsonb; next_order integer; result jsonb;
BEGIN
  SELECT * INTO a FROM public.auctions WHERE id=p_auction_id FOR UPDATE;
  IF a.id IS NULL OR NOT public.is_tournament_organizer(a.tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  old:=public.auction_request_begin(p_auction_id,'REQUEUE',p_request_key,jsonb_build_object('player',p_auction_player_id,'version',p_expected_player_version)); IF old IS NOT NULL THEN RETURN old; END IF;
  SELECT * INTO ap FROM public.auction_players WHERE id=p_auction_player_id AND auction_id=p_auction_id FOR UPDATE;
  SELECT reauction_price_rule INTO rule FROM public.tournament_settings WHERE tournament_id=a.tournament_id;
  IF ap.status<>'UNSOLD' OR ap.state_version<>p_expected_player_version THEN RAISE EXCEPTION 'Only an expected UNSOLD player may be requeued'; END IF;
  SELECT COALESCE(max(auction_order),0)+1 INTO next_order FROM public.auction_players WHERE auction_id=p_auction_id AND attempt_number=ap.attempt_number+1;
  UPDATE public.auction_players SET status='WAITING',attempt_number=attempt_number+1,auction_order=next_order,base_price=CASE WHEN rule='SAME_BASE_PRICE' THEN original_base_price ELSE base_price END,live_started_at=NULL,terminal_at=NULL,state_version=state_version+1 WHERE id=ap.id RETURNING * INTO ap;
  UPDATE public.auctions SET state_version=state_version+1 WHERE id=p_auction_id;
  PERFORM public.emit_auction_event(p_auction_id,'PLAYER_REQUEUED',jsonb_build_object('auction_player_id',ap.id,'attempt_number',ap.attempt_number,'base_price',ap.base_price));
  INSERT INTO public.audit_logs(tournament_id,user_id,action,entity_type,entity_id,after_json) VALUES(a.tournament_id,auth.uid(),'AUCTION_PLAYER_REQUEUED','auction_players',ap.id,jsonb_build_object('attempt_number',ap.attempt_number,'base_price',ap.base_price));
  result:=jsonb_build_object('auction_player_id',ap.id,'status','WAITING','attempt_number',ap.attempt_number,'auction_order',ap.auction_order,'base_price',ap.base_price,'player_version',ap.state_version);
  RETURN public.auction_request_finish(p_auction_id,'REQUEUE',p_request_key,result);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_auction(p_auction_id uuid,p_expected_version bigint,p_request_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE a public.auctions%ROWTYPE; old jsonb; result jsonb;
BEGIN
  SELECT * INTO a FROM public.auctions WHERE id=p_auction_id FOR UPDATE;
  IF a.id IS NULL OR NOT public.is_tournament_organizer(a.tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  old:=public.auction_request_begin(p_auction_id,'COMPLETE',p_request_key,jsonb_build_object('version',p_expected_version)); IF old IS NOT NULL THEN RETURN old; END IF;
  IF a.status NOT IN('LIVE','PAUSED') OR a.state_version<>p_expected_version THEN RAISE EXCEPTION 'Auction cannot be completed from current state'; END IF;
  IF EXISTS(SELECT 1 FROM public.auction_players WHERE auction_id=p_auction_id AND status IN('WAITING','LIVE')) THEN RAISE EXCEPTION 'Operational players remain'; END IF;
  UPDATE public.auctions SET status='COMPLETED',completed_at=now(),state_version=state_version+1 WHERE id=p_auction_id RETURNING state_version INTO p_expected_version;
  PERFORM public.emit_auction_event(p_auction_id,'AUCTION_COMPLETED','{}');
  INSERT INTO public.audit_logs(tournament_id,user_id,action,entity_type,entity_id) VALUES(a.tournament_id,auth.uid(),'AUCTION_COMPLETED','auctions',p_auction_id);
  result:=jsonb_build_object('auction_id',p_auction_id,'status','COMPLETED','state_version',p_expected_version,'sold_count',(SELECT count(*) FROM public.auction_players WHERE auction_id=p_auction_id AND status='SOLD'),'unsold_count',(SELECT count(*) FROM public.auction_players WHERE auction_id=p_auction_id AND status='UNSOLD'));
  RETURN public.auction_request_finish(p_auction_id,'COMPLETE',p_request_key,result);
END;
$$;

--------------------------------------------------------------------------------
-- 7. SANITIZED SNAPSHOTS
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_auction_public_state(p_auction_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE a public.auctions%ROWTYPE;
BEGIN
  SELECT x.* INTO a FROM public.auctions x JOIN public.tournaments t ON t.id=x.tournament_id WHERE x.id=p_auction_id AND (t.is_public OR public.is_tournament_member(t.id));
  IF a.id IS NULL THEN RAISE EXCEPTION 'Auction not available'; END IF;
  RETURN jsonb_build_object('auction',jsonb_build_object('id',a.id,'tournament_id',a.tournament_id,'status',a.status,'state_version',a.state_version),'current_player',(SELECT jsonb_build_object('auction_player_id',ap.id,'base_price',ap.base_price,'category_code',ap.category_code,'category_label',ap.category_label,'category_base_price',ap.category_base_price,'attempt_number',ap.attempt_number,'state_version',ap.state_version,'player',jsonb_build_object('id',p.id,'display_name',p.display_name,'photo_path',p.photo_path,'primary_position',p.primary_position,'secondary_position',p.secondary_position)) FROM public.auction_players ap JOIN public.player_profiles p ON p.id=ap.player_id WHERE ap.auction_id=a.id AND ap.status='LIVE'),'highest_bid',(SELECT jsonb_build_object('id',b.id,'amount',b.amount,'team',jsonb_build_object('id',t.id,'name',t.name,'short_name',t.short_name,'logo_path',t.logo_path)) FROM public.auction_bids b JOIN public.teams t ON t.id=b.team_id WHERE b.auction_player_id=(SELECT id FROM public.auction_players WHERE auction_id=a.id AND status='LIVE') ORDER BY b.amount DESC,b.created_at,b.id LIMIT 1),'recent_bids',COALESCE((SELECT jsonb_agg(x.item ORDER BY x.created_at DESC) FROM (SELECT b.created_at,jsonb_build_object('id',b.id,'amount',b.amount,'created_at',b.created_at,'team',jsonb_build_object('id',t.id,'name',t.name,'short_name',t.short_name,'logo_path',t.logo_path)) item FROM public.auction_bids b JOIN public.teams t ON t.id=b.team_id WHERE b.auction_player_id=(SELECT id FROM public.auction_players WHERE auction_id=a.id AND status='LIVE') ORDER BY b.created_at DESC LIMIT 20)x),'[]'::jsonb),'progress',jsonb_build_object('waiting',(SELECT count(*) FROM public.auction_players WHERE auction_id=a.id AND status='WAITING'),'sold',(SELECT count(*) FROM public.auction_players WHERE auction_id=a.id AND status='SOLD'),'unsold',(SELECT count(*) FROM public.auction_players WHERE auction_id=a.id AND status='UNSOLD')),'last_sequence',a.event_sequence);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_auction_owner_state(p_auction_id uuid,p_team_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE a public.auctions%ROWTYPE; f jsonb; pub jsonb; next_bid numeric;
BEGIN
  SELECT * INTO a FROM public.auctions WHERE id=p_auction_id;
  IF a.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.team_owners o JOIN public.teams t ON t.id=o.team_id WHERE o.team_id=p_team_id AND o.user_id=auth.uid() AND o.status='ACTIVE' AND t.tournament_id=a.tournament_id AND t.status='ACTIVE') THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  pub:=public.get_auction_public_state(p_auction_id); f:=public.auction_team_finance(p_auction_id,p_team_id,1);
  next_bid:=COALESCE((pub->'highest_bid'->>'amount')::numeric+(SELECT minimum_bid_increment FROM public.auctions WHERE id=p_auction_id),(pub->'current_player'->>'base_price')::numeric);
  RETURN pub||jsonb_build_object('team',jsonb_build_object('id',p_team_id,'remaining_purse',f->'remaining','spent_purse',f->'spent','active_squad',f->'active_squad','minimum_squad',f->'minimum_squad','maximum_squad',f->'maximum_squad','protected_reserve',f->'reserve','max_allowed_bid',f->'max_allowed_bid','may_bid',a.status='LIVE' AND pub->'current_player' IS NOT NULL AND next_bid<=(f->>'max_allowed_bid')::numeric,'blocked_reason',CASE WHEN a.status<>'LIVE' THEN 'AUCTION_NOT_LIVE' WHEN pub->'current_player' IS NULL THEN 'NO_LIVE_PLAYER' WHEN next_bid>(f->>'max_allowed_bid')::numeric THEN 'PROTECTED_PURSE' ELSE NULL END),'next_minimum_bid',next_bid);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_auction_organizer_state(p_auction_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE a public.auctions%ROWTYPE; pub jsonb;
BEGIN
  SELECT * INTO a FROM public.auctions WHERE id=p_auction_id;
  IF a.id IS NULL OR NOT public.is_tournament_organizer(a.tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  pub:=public.get_auction_public_state(p_auction_id);
  RETURN pub||jsonb_build_object('minimum_acquisition_reserve_price',a.minimum_acquisition_reserve_price,'categories',COALESCE((SELECT jsonb_agg(jsonb_build_object('code',c.category_code,'display_name',c.display_name,'base_price',c.base_price,'display_order',c.display_order) ORDER BY c.display_order) FROM public.tournament_auction_categories c WHERE c.tournament_id=a.tournament_id),'[]'::jsonb),'readiness',public.get_auction_readiness(a.tournament_id),'queue',COALESCE((SELECT jsonb_agg(jsonb_build_object('auction_player_id',ap.id,'player_id',ap.player_id,'status',ap.status,'base_price',ap.base_price,'category_code',ap.category_code,'category_label',ap.category_label,'category_base_price',ap.category_base_price,'attempt_number',ap.attempt_number,'auction_order',ap.auction_order,'state_version',ap.state_version) ORDER BY ap.attempt_number,ap.auction_order) FROM public.auction_players ap WHERE ap.auction_id=a.id),'[]'::jsonb),'teams',COALESCE((SELECT jsonb_agg(jsonb_build_object('team_id',w.team_id,'starting_purse',w.starting_balance,'spent',w.spent_amount,'remaining',w.remaining_balance,'finance',public.auction_team_finance(a.id,w.team_id,1))) FROM public.auction_team_wallets w WHERE w.auction_id=a.id),'[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_live_state(p_tournament_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE aid uuid; lid uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.tournaments t WHERE t.id=p_tournament_id AND (t.is_public OR public.is_tournament_member(t.id))) THEN RAISE EXCEPTION 'Tournament not available'; END IF;
  SELECT id INTO aid FROM public.auctions WHERE tournament_id=p_tournament_id AND status IN('LIVE','PAUSED') ORDER BY created_at DESC LIMIT 1;
  SELECT id INTO lid FROM public.lot_sessions WHERE tournament_id=p_tournament_id AND status='LIVE' ORDER BY created_at DESC LIMIT 1;
  IF aid IS NOT NULL AND lid IS NOT NULL THEN RAISE EXCEPTION 'Conflicting public live operations'; END IF;
  IF aid IS NOT NULL THEN RETURN jsonb_build_object('mode','AUCTION','state',public.get_auction_public_state(aid)); END IF;
  IF lid IS NOT NULL THEN RETURN jsonb_build_object('mode','LOT','state',public.get_lot_public_state(lid)); END IF;
  RETURN jsonb_build_object('mode','IDLE','state',NULL);
END;
$$;

--------------------------------------------------------------------------------
-- 8. LEAST PRIVILEGE AND REALTIME
--------------------------------------------------------------------------------
REVOKE INSERT,UPDATE,DELETE ON public.tournament_auction_categories,public.auctions,public.auction_team_wallets,public.auction_players,public.auction_bids,public.auction_sales,public.purse_transactions,public.auction_operation_requests,public.auction_public_events FROM anon,authenticated;
GRANT SELECT ON public.tournament_auction_categories TO authenticated;
GRANT SELECT ON public.auction_public_events TO anon,authenticated;

REVOKE ALL ON FUNCTION public.auction_player_is_eligible(uuid,uuid),public.emit_auction_event(uuid,text,jsonb),public.auction_team_finance(uuid,uuid,numeric),public.auction_request_begin(uuid,text,text,jsonb),public.auction_request_finish(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.update_auction_price_categories(uuid,text,numeric,text,numeric,text,numeric),public.approve_player_registration(uuid,text,text,uuid),public.prepare_auction(uuid),public.set_auction_lifecycle(uuid,text,bigint,text),public.open_next_auction_player(uuid,bigint,text),public.place_auction_bid(uuid,uuid,uuid,numeric,text,bigint,numeric),public.finalize_auction_sale(uuid,uuid,bigint,uuid,text),public.mark_auction_player_unsold(uuid,uuid,bigint,text),public.set_reauction_price(uuid,uuid,numeric,bigint,text),public.requeue_auction_player(uuid,uuid,bigint,text),public.complete_auction(uuid,bigint,text),public.get_auction_readiness(uuid),public.get_auction_organizer_state(uuid),public.get_auction_owner_state(uuid,uuid),public.get_auction_public_state(uuid),public.get_public_live_state(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_auction_price_categories(uuid,text,numeric,text,numeric,text,numeric),public.approve_player_registration(uuid,text,text,uuid),public.prepare_auction(uuid),public.set_auction_lifecycle(uuid,text,bigint,text),public.open_next_auction_player(uuid,bigint,text),public.place_auction_bid(uuid,uuid,uuid,numeric,text,bigint,numeric),public.finalize_auction_sale(uuid,uuid,bigint,uuid,text),public.mark_auction_player_unsold(uuid,uuid,bigint,text),public.set_reauction_price(uuid,uuid,numeric,bigint,text),public.requeue_auction_player(uuid,uuid,bigint,text),public.complete_auction(uuid,bigint,text),public.get_auction_readiness(uuid),public.get_auction_organizer_state(uuid),public.get_auction_owner_state(uuid,uuid),public.get_auction_public_state(uuid),public.get_public_live_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auction_public_state(uuid),public.get_public_live_state(uuid) TO anon;

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='auction_public_events') THEN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.auction_public_events'; END IF;
    IF EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='auction_bids') THEN EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.auction_bids'; END IF;
    IF EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='auction_team_wallets') THEN EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.auction_team_wallets'; END IF;
    IF EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='purse_transactions') THEN EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.purse_transactions'; END IF;
    IF EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='auction_players') THEN EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.auction_players'; END IF;
    IF EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='auction_sales') THEN EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.auction_sales'; END IF;
  END IF;
END $$;
