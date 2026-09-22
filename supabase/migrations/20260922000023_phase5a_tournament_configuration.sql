-- 0023_phase5a_tournament_configuration.sql
-- Tournament readiness, special-player allocation, stages, and volleyball rules.

--------------------------------------------------------------------------------
-- 1. CONFIGURATION COLUMNS + LEGACY-SAFE BACKFILL
--------------------------------------------------------------------------------

ALTER TABLE public.tournament_settings
  ADD COLUMN icon_selection_method text,
  ADD COLUMN setter_selection_method text,
  ADD COLUMN reauction_price_rule text;

UPDATE public.tournament_settings
SET icon_selection_method = 'LOT_DRAW',
    setter_selection_method = 'LOT_DRAW',
    reauction_price_rule = 'SAME_BASE_PRICE';

-- Only infer AUCTION where downstream auction participation is conclusive and
-- no corresponding lot entry/assignment exists. Historical rows are untouched.
UPDATE public.tournament_settings settings
SET icon_selection_method = 'AUCTION'
WHERE EXISTS (
  SELECT 1
  FROM public.auctions auction
  JOIN public.auction_players auction_player ON auction_player.auction_id = auction.id
  JOIN public.player_tournament_registrations registration
    ON registration.tournament_id = auction.tournament_id
   AND registration.player_id = auction_player.player_id
  WHERE auction.tournament_id = settings.tournament_id
    AND registration.auction_category = 'ICON_LOT'
    AND auction_player.status IN ('LIVE', 'SOLD', 'UNSOLD')
)
AND NOT EXISTS (
  SELECT 1 FROM public.team_players team_player
  WHERE team_player.tournament_id = settings.tournament_id
    AND team_player.acquisition_type = 'ICON_LOT'
)
AND NOT EXISTS (
  SELECT 1 FROM public.lot_entries entry
  JOIN public.lot_sessions session ON session.id = entry.lot_session_id
  WHERE session.tournament_id = settings.tournament_id AND session.lot_type = 'ICON'
);

UPDATE public.tournament_settings settings
SET setter_selection_method = 'AUCTION'
WHERE EXISTS (
  SELECT 1
  FROM public.auctions auction
  JOIN public.auction_players auction_player ON auction_player.auction_id = auction.id
  JOIN public.player_tournament_registrations registration
    ON registration.tournament_id = auction.tournament_id
   AND registration.player_id = auction_player.player_id
  WHERE auction.tournament_id = settings.tournament_id
    AND registration.auction_category = 'SETTER_LOT'
    AND auction_player.status IN ('LIVE', 'SOLD', 'UNSOLD')
)
AND NOT EXISTS (
  SELECT 1 FROM public.team_players team_player
  WHERE team_player.tournament_id = settings.tournament_id
    AND team_player.acquisition_type = 'SETTER_LOT'
)
AND NOT EXISTS (
  SELECT 1 FROM public.lot_entries entry
  JOIN public.lot_sessions session ON session.id = entry.lot_session_id
  WHERE session.tournament_id = settings.tournament_id AND session.lot_type = 'SETTER'
);

ALTER TABLE public.tournament_settings
  ALTER COLUMN icon_selection_method SET DEFAULT 'LOT_DRAW',
  ALTER COLUMN icon_selection_method SET NOT NULL,
  ALTER COLUMN setter_selection_method SET DEFAULT 'LOT_DRAW',
  ALTER COLUMN setter_selection_method SET NOT NULL,
  ALTER COLUMN reauction_price_rule SET DEFAULT 'SAME_BASE_PRICE',
  ALTER COLUMN reauction_price_rule SET NOT NULL,
  ADD CONSTRAINT tournament_settings_icon_method_check
    CHECK (icon_selection_method IN ('LOT_DRAW', 'AUCTION')),
  ADD CONSTRAINT tournament_settings_setter_method_check
    CHECK (setter_selection_method IN ('LOT_DRAW', 'AUCTION')),
  ADD CONSTRAINT tournament_settings_reauction_rule_check
    CHECK (reauction_price_rule IN ('SAME_BASE_PRICE', 'ORGANIZER_SETS_PRICE'));

-- Existing historical prices are preserved. New pool rows and future edits must
-- respect the tournament floor whenever a positive floor is configured.
CREATE OR REPLACE FUNCTION public.enforce_auction_player_price_floor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE v_floor numeric;
BEGIN
  SELECT settings.auction_base_price INTO v_floor
  FROM public.auctions auction
  JOIN public.tournament_settings settings ON settings.tournament_id = auction.tournament_id
  WHERE auction.id = NEW.auction_id;
  IF v_floor IS NOT NULL AND v_floor > 0 AND NEW.base_price < v_floor THEN
    RAISE EXCEPTION 'Player base price cannot be below the tournament minimum acquisition price (%)', v_floor;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER auction_player_price_floor_guard
BEFORE INSERT OR UPDATE OF auction_id, base_price ON public.auction_players
FOR EACH ROW EXECUTE FUNCTION public.enforce_auction_player_price_floor();

--------------------------------------------------------------------------------
-- 2. VOLLEYBALL RULE AND STAGE INTEGRITY
--------------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.volleyball_rules
    GROUP BY tournament_id HAVING count(*) FILTER (WHERE stage_id IS NULL) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one tournament-default volleyball rule: duplicate defaults exist';
  END IF;
  IF EXISTS (
    SELECT stage_id FROM public.volleyball_rules WHERE stage_id IS NOT NULL
    GROUP BY stage_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one volleyball rule per stage: duplicates exist';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.volleyball_rules rule
    JOIN public.tournament_stages stage ON stage.id = rule.stage_id
    WHERE rule.stage_id IS NOT NULL AND rule.tournament_id <> stage.tournament_id
  ) THEN
    RAISE EXCEPTION 'Cannot enforce volleyball rule ownership: cross-tournament rules exist';
  END IF;
END;
$$;

CREATE UNIQUE INDEX volleyball_rules_one_default_per_tournament
  ON public.volleyball_rules (tournament_id) WHERE stage_id IS NULL;
CREATE UNIQUE INDEX volleyball_rules_one_per_stage
  ON public.volleyball_rules (stage_id) WHERE stage_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_stage_tournament_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.stage_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tournament_stages stage
    WHERE stage.id = NEW.stage_id AND stage.tournament_id = NEW.tournament_id
  ) THEN
    RAISE EXCEPTION 'Stage must belong to the same tournament';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER volleyball_rules_stage_tournament_guard
BEFORE INSERT OR UPDATE OF tournament_id, stage_id ON public.volleyball_rules
FOR EACH ROW EXECUTE FUNCTION public.enforce_stage_tournament_consistency();

--------------------------------------------------------------------------------
-- 3. DERIVED SPECIAL-ALLOCATION LOCKS
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.special_allocation_lock(
  p_tournament_id uuid,
  p_classification text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_lot_type text := CASE p_classification WHEN 'ICON_LOT' THEN 'ICON' WHEN 'SETTER_LOT' THEN 'SETTER' END;
BEGIN
  IF v_lot_type IS NULL THEN
    RAISE EXCEPTION 'Unsupported special-player classification';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.lot_sessions session
    WHERE session.tournament_id = p_tournament_id AND session.lot_type = v_lot_type
      AND session.status IN ('SHUFFLED', 'LIVE', 'COMPLETED')
  ) THEN
    RETURN jsonb_build_object('locked', true, 'reason', v_lot_type || ' player lot has started.');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.team_players team_player
    WHERE team_player.tournament_id = p_tournament_id
      AND team_player.acquisition_type = p_classification
  ) THEN
    RETURN jsonb_build_object('locked', true, 'reason', v_lot_type || ' players have already been assigned.');
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.auctions auction
    JOIN public.auction_players auction_player ON auction_player.auction_id = auction.id
    JOIN public.player_tournament_registrations registration
      ON registration.tournament_id = auction.tournament_id
     AND registration.player_id = auction_player.player_id
    WHERE auction.tournament_id = p_tournament_id
      AND registration.auction_category = p_classification
      AND (
        auction.status IN ('READY', 'LIVE', 'PAUSED', 'COMPLETED')
        OR auction_player.status IN ('LIVE', 'SOLD', 'UNSOLD')
        OR EXISTS (SELECT 1 FROM public.auction_bids bid WHERE bid.auction_player_id = auction_player.id)
        OR EXISTS (SELECT 1 FROM public.auction_sales sale WHERE sale.auction_player_id = auction_player.id)
      )
  ) THEN
    RETURN jsonb_build_object('locked', true, 'reason', v_lot_type || ' players have entered the auction process.');
  END IF;
  RETURN jsonb_build_object('locked', false, 'reason', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.special_allocation_lock(uuid, text) FROM PUBLIC, anon, authenticated;

--------------------------------------------------------------------------------
-- 4. AUTHORITATIVE SETTINGS MUTATION
--------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.update_tournament_settings(uuid, boolean, boolean, integer, integer, numeric, numeric, numeric);

CREATE OR REPLACE FUNCTION public.update_tournament_settings(
  p_tournament_id uuid,
  p_player_registration_enabled boolean,
  p_team_registration_enabled boolean,
  p_max_teams integer DEFAULT NULL,
  p_min_squad_size integer DEFAULT 1,
  p_max_squad_size integer DEFAULT NULL,
  p_auction_starting_purse numeric DEFAULT NULL,
  p_auction_base_price numeric DEFAULT NULL,
  p_auction_bid_increment numeric DEFAULT NULL,
  p_icon_selection_method text DEFAULT 'LOT_DRAW',
  p_setter_selection_method text DEFAULT 'LOT_DRAW',
  p_reauction_price_rule text DEFAULT 'SAME_BASE_PRICE'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tournament public.tournaments%ROWTYPE;
  v_settings public.tournament_settings%ROWTYPE;
  v_current_teams integer;
  v_largest_roster integer;
  v_icon_lock jsonb;
  v_setter_lock jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT * INTO v_tournament FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  SELECT * INTO v_settings FROM public.tournament_settings
  WHERE tournament_id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament settings not found'; END IF;

  IF p_icon_selection_method NOT IN ('LOT_DRAW', 'AUCTION')
    OR p_setter_selection_method NOT IN ('LOT_DRAW', 'AUCTION') THEN
    RAISE EXCEPTION 'Invalid special-player selection method';
  END IF;
  IF p_reauction_price_rule NOT IN ('SAME_BASE_PRICE', 'ORGANIZER_SETS_PRICE') THEN
    RAISE EXCEPTION 'Invalid re-auction price rule';
  END IF;
  v_icon_lock := public.special_allocation_lock(p_tournament_id, 'ICON_LOT');
  v_setter_lock := public.special_allocation_lock(p_tournament_id, 'SETTER_LOT');
  IF p_icon_selection_method <> v_settings.icon_selection_method AND (v_icon_lock->>'locked')::boolean THEN
    RAISE EXCEPTION 'Icon selection method is locked: %', v_icon_lock->>'reason';
  END IF;
  IF p_setter_selection_method <> v_settings.setter_selection_method AND (v_setter_lock->>'locked')::boolean THEN
    RAISE EXCEPTION 'Setter selection method is locked: %', v_setter_lock->>'reason';
  END IF;
  IF p_min_squad_size IS NULL OR p_min_squad_size <= 0 THEN
    RAISE EXCEPTION 'Minimum squad size must be greater than zero';
  END IF;
  IF p_max_squad_size IS NOT NULL AND p_max_squad_size < p_min_squad_size THEN
    RAISE EXCEPTION 'Maximum squad size must be at least the minimum squad size';
  END IF;
  SELECT count(*) INTO v_current_teams FROM public.teams
  WHERE tournament_id = p_tournament_id AND status = 'ACTIVE';
  IF p_max_teams IS NOT NULL AND p_max_teams < v_current_teams THEN
    RAISE EXCEPTION 'Cannot lower max_teams below current approved team count (%)', v_current_teams;
  END IF;
  SELECT COALESCE(max(roster_size), 0) INTO v_largest_roster FROM (
    SELECT count(*) AS roster_size FROM public.team_players
    WHERE tournament_id = p_tournament_id AND status = 'ACTIVE' GROUP BY team_id
  ) roster;
  IF p_max_squad_size IS NOT NULL AND p_max_squad_size < v_largest_roster THEN
    RAISE EXCEPTION 'Cannot lower max_squad_size below largest current team size (%)', v_largest_roster;
  END IF;
  IF v_tournament.format = 'LEAGUE' AND v_tournament.league_mode = 'AUCTION' THEN
    IF p_auction_starting_purse IS NOT NULL AND p_auction_starting_purse < 0 THEN RAISE EXCEPTION 'Auction starting purse cannot be negative'; END IF;
    IF p_auction_base_price IS NOT NULL AND p_auction_base_price < 0 THEN RAISE EXCEPTION 'Auction base price cannot be negative'; END IF;
    IF p_auction_bid_increment IS NOT NULL AND p_auction_bid_increment <= 0 THEN RAISE EXCEPTION 'Auction bid increment must be greater than zero'; END IF;
  ELSIF p_auction_starting_purse IS NOT NULL OR p_auction_base_price IS NOT NULL OR p_auction_bid_increment IS NOT NULL THEN
    RAISE EXCEPTION 'Auction settings are only allowed for Auction League tournaments';
  END IF;

  UPDATE public.tournament_settings SET
    player_registration_enabled = p_player_registration_enabled,
    team_registration_enabled = p_team_registration_enabled,
    max_teams = p_max_teams,
    min_squad_size = p_min_squad_size,
    max_squad_size = p_max_squad_size,
    auction_starting_purse = p_auction_starting_purse,
    auction_base_price = p_auction_base_price,
    auction_bid_increment = p_auction_bid_increment,
    icon_selection_method = p_icon_selection_method,
    setter_selection_method = p_setter_selection_method,
    reauction_price_rule = p_reauction_price_rule,
    updated_at = now()
  WHERE tournament_id = p_tournament_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.update_tournament_settings(uuid, boolean, boolean, integer, integer, integer, numeric, numeric, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_tournament_settings(uuid, boolean, boolean, integer, integer, integer, numeric, numeric, numeric, text, text, text) TO authenticated;

--------------------------------------------------------------------------------
-- 5. AUTHORITATIVE STAGE AND RULE MUTATION
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_tournament_stage(
  p_tournament_id uuid,
  p_stage_id uuid,
  p_name text,
  p_stage_type text,
  p_sequence integer,
  p_qualification_count integer DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_stage_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF nullif(btrim(p_name), '') IS NULL OR p_stage_type NOT IN ('LEAGUE', 'KNOCKOUT') OR p_sequence <= 0 THEN RAISE EXCEPTION 'Invalid stage configuration'; END IF;
  IF p_stage_id IS NULL THEN
    INSERT INTO public.tournament_stages (tournament_id, name, stage_type, sequence, qualification_count)
    VALUES (p_tournament_id, btrim(p_name), p_stage_type, p_sequence, p_qualification_count) RETURNING id INTO v_stage_id;
  ELSE
    IF EXISTS (SELECT 1 FROM public.matches WHERE tournament_id = p_tournament_id AND stage_id = p_stage_id) THEN
      RAISE EXCEPTION 'Stage structure is locked because matches reference it';
    END IF;
    UPDATE public.tournament_stages SET name = btrim(p_name), stage_type = p_stage_type,
      sequence = p_sequence, qualification_count = p_qualification_count
    WHERE id = p_stage_id AND tournament_id = p_tournament_id RETURNING id INTO v_stage_id;
    IF v_stage_id IS NULL THEN RAISE EXCEPTION 'Stage not found'; END IF;
  END IF;
  RETURN v_stage_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_volleyball_rule(
  p_tournament_id uuid,
  p_stage_id uuid,
  p_sets_to_win integer,
  p_win_by_two boolean,
  p_set_rules jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_rule_id uuid; v_rule_count integer; v_max_set integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_stage_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tournament_stages WHERE id = p_stage_id AND tournament_id = p_tournament_id) THEN RAISE EXCEPTION 'Stage must belong to the same tournament'; END IF;
  IF p_stage_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.matches WHERE tournament_id = p_tournament_id AND stage_id = p_stage_id AND status IN ('LIVE', 'COMPLETED')
  ) THEN RAISE EXCEPTION 'Scoring rules are locked because a stage match is live or completed'; END IF;
  IF p_stage_id IS NULL AND EXISTS (
    SELECT 1 FROM public.matches WHERE tournament_id = p_tournament_id AND status IN ('LIVE', 'COMPLETED')
      AND (stage_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.volleyball_rules r WHERE r.tournament_id = p_tournament_id AND r.stage_id = matches.stage_id))
  ) THEN RAISE EXCEPTION 'Default scoring rules are locked by live or completed matches'; END IF;
  IF p_sets_to_win <= 0 OR jsonb_typeof(p_set_rules) <> 'array' THEN RAISE EXCEPTION 'Invalid volleyball rule'; END IF;
  SELECT count(*), max((item->>'set_number')::integer) INTO v_rule_count, v_max_set FROM jsonb_array_elements(p_set_rules) item;
  IF v_rule_count < (p_sets_to_win * 2 - 1) OR v_max_set < (p_sets_to_win * 2 - 1) THEN RAISE EXCEPTION 'Set definitions do not cover the match format'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_set_rules) item WHERE (item->>'set_number')::integer <= 0 OR (item->>'target_points')::integer <= 0) THEN RAISE EXCEPTION 'Set numbers and target points must be positive'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_set_rules) item GROUP BY (item->>'set_number')::integer HAVING count(*) > 1) THEN RAISE EXCEPTION 'Set numbers must be unique'; END IF;

  SELECT id INTO v_rule_id FROM public.volleyball_rules
  WHERE tournament_id = p_tournament_id AND stage_id IS NOT DISTINCT FROM p_stage_id FOR UPDATE;
  IF v_rule_id IS NULL THEN
    INSERT INTO public.volleyball_rules (tournament_id, stage_id, sets_to_win, win_by_two)
    VALUES (p_tournament_id, p_stage_id, p_sets_to_win, p_win_by_two) RETURNING id INTO v_rule_id;
  ELSE
    UPDATE public.volleyball_rules SET sets_to_win = p_sets_to_win, win_by_two = p_win_by_two, updated_at = now() WHERE id = v_rule_id;
    DELETE FROM public.volleyball_set_rules WHERE volleyball_rule_id = v_rule_id;
  END IF;
  INSERT INTO public.volleyball_set_rules (volleyball_rule_id, set_number, target_points)
  SELECT v_rule_id, (item->>'set_number')::integer, (item->>'target_points')::integer FROM jsonb_array_elements(p_set_rules) item;
  RETURN v_rule_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_tournament_stage(uuid, uuid, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_volleyball_rule(uuid, uuid, integer, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_tournament_stage(uuid, uuid, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_volleyball_rule(uuid, uuid, integer, boolean, jsonb) TO authenticated;

--------------------------------------------------------------------------------
-- 6. STRUCTURED READINESS + CONFIGURATION PAYLOAD
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_tournament_phase5a_configuration(p_tournament_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tournament public.tournaments%ROWTYPE;
  v_settings public.tournament_settings%ROWTYPE;
  v_icon_lock jsonb; v_setter_lock jsonb;
  v_active_teams integer; v_owned_teams integer; v_unclassified integer;
  v_icon_players integer; v_setter_players integer; v_main_players integer;
  v_icon_conflicts integer; v_setter_conflicts integer; v_auction_conflicts integer; v_price_conflicts integer; v_route_conflicts integer;
  v_icon_status text; v_setter_status text; v_auction_status text;
  v_icon_issues jsonb := '[]'::jsonb; v_setter_issues jsonb := '[]'::jsonb; v_auction_issues jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO v_tournament FROM public.tournaments WHERE id = p_tournament_id;
  SELECT * INTO v_settings FROM public.tournament_settings WHERE tournament_id = p_tournament_id;
  IF v_tournament.id IS NULL OR v_settings.tournament_id IS NULL THEN RAISE EXCEPTION 'Tournament configuration not found'; END IF;
  v_icon_lock := public.special_allocation_lock(p_tournament_id, 'ICON_LOT');
  v_setter_lock := public.special_allocation_lock(p_tournament_id, 'SETTER_LOT');
  SELECT count(*) INTO v_active_teams FROM public.teams WHERE tournament_id = p_tournament_id AND status = 'ACTIVE';
  SELECT count(DISTINCT team.id) INTO v_owned_teams FROM public.teams team JOIN public.team_owners owner ON owner.team_id = team.id AND owner.status = 'ACTIVE' WHERE team.tournament_id = p_tournament_id AND team.status = 'ACTIVE';
  SELECT count(*) FILTER (WHERE auction_category IS NULL), count(*) FILTER (WHERE auction_category = 'ICON_LOT'), count(*) FILTER (WHERE auction_category = 'SETTER_LOT'), count(*) FILTER (WHERE auction_category = 'MAIN_AUCTION')
  INTO v_unclassified, v_icon_players, v_setter_players, v_main_players FROM public.player_tournament_registrations WHERE tournament_id = p_tournament_id AND status = 'APPROVED';
  SELECT count(*) INTO v_icon_conflicts FROM public.player_tournament_registrations registration
    WHERE registration.tournament_id = p_tournament_id AND registration.status = 'APPROVED' AND registration.auction_category = 'ICON_LOT'
      AND (EXISTS (SELECT 1 FROM public.team_players tp WHERE tp.tournament_id = p_tournament_id AND tp.player_id = registration.player_id AND tp.status = 'ACTIVE')
        OR EXISTS (SELECT 1 FROM public.auction_players ap JOIN public.auctions a ON a.id = ap.auction_id WHERE a.tournament_id = p_tournament_id AND ap.player_id = registration.player_id));
  SELECT count(*) INTO v_setter_conflicts FROM public.player_tournament_registrations registration
    WHERE registration.tournament_id = p_tournament_id AND registration.status = 'APPROVED' AND registration.auction_category = 'SETTER_LOT'
      AND (EXISTS (SELECT 1 FROM public.team_players tp WHERE tp.tournament_id = p_tournament_id AND tp.player_id = registration.player_id AND tp.status = 'ACTIVE')
        OR EXISTS (SELECT 1 FROM public.auction_players ap JOIN public.auctions a ON a.id = ap.auction_id WHERE a.tournament_id = p_tournament_id AND ap.player_id = registration.player_id));
  SELECT count(*) INTO v_auction_conflicts FROM public.auction_players ap JOIN public.auctions a ON a.id = ap.auction_id JOIN public.team_players tp ON tp.tournament_id = a.tournament_id AND tp.player_id = ap.player_id AND tp.status = 'ACTIVE' WHERE a.tournament_id = p_tournament_id;
  SELECT count(*) INTO v_price_conflicts FROM public.auction_players ap JOIN public.auctions a ON a.id = ap.auction_id WHERE a.tournament_id = p_tournament_id AND v_settings.auction_base_price IS NOT NULL AND ap.base_price < v_settings.auction_base_price;
  SELECT count(*) INTO v_route_conflicts
  FROM public.auction_players ap
  JOIN public.auctions a ON a.id = ap.auction_id
  LEFT JOIN public.player_tournament_registrations registration ON registration.tournament_id = a.tournament_id AND registration.player_id = ap.player_id AND registration.status = 'APPROVED'
  WHERE a.tournament_id = p_tournament_id AND (
    registration.id IS NULL
    OR (registration.auction_category = 'ICON_LOT' AND v_settings.icon_selection_method <> 'AUCTION')
    OR (registration.auction_category = 'SETTER_LOT' AND v_settings.setter_selection_method <> 'AUCTION')
  );

  IF v_settings.icon_selection_method = 'AUCTION' THEN v_icon_status := 'NOT_APPLICABLE';
  ELSE
    IF NOT (v_tournament.format = 'LEAGUE' AND v_tournament.league_mode = 'AUCTION') THEN v_icon_issues := v_icon_issues || jsonb_build_array('Tournament must be an Auction League.'); END IF;
    IF v_icon_players = 0 THEN v_icon_issues := v_icon_issues || jsonb_build_array('No approved Icon players are available.'); END IF;
    IF v_active_teams = 0 THEN v_icon_issues := v_icon_issues || jsonb_build_array('At least one active team is required.'); END IF;
    IF v_icon_conflicts > 0 THEN v_icon_issues := v_icon_issues || jsonb_build_array(v_icon_conflicts || ' Icon player(s) are already assigned or routed into auction.'); END IF;
    IF EXISTS (SELECT 1 FROM public.lot_sessions WHERE tournament_id = p_tournament_id AND lot_type = 'ICON' AND status <> 'CANCELLED') THEN v_icon_issues := v_icon_issues || jsonb_build_array('An Icon lot session already exists.'); END IF;
    IF v_settings.max_squad_size IS NOT NULL AND EXISTS (SELECT 1 FROM public.teams team WHERE team.tournament_id = p_tournament_id AND team.status = 'ACTIVE' AND (SELECT count(*) FROM public.team_players tp WHERE tp.team_id = team.id AND tp.status = 'ACTIVE') >= v_settings.max_squad_size) THEN v_icon_issues := v_icon_issues || jsonb_build_array('One or more teams have no remaining squad capacity.'); END IF;
    v_icon_status := CASE WHEN jsonb_array_length(v_icon_issues) = 0 THEN 'READY' ELSE 'BLOCKED' END;
  END IF;
  IF v_settings.setter_selection_method = 'AUCTION' THEN v_setter_status := 'NOT_APPLICABLE';
  ELSE
    IF NOT (v_tournament.format = 'LEAGUE' AND v_tournament.league_mode = 'AUCTION') THEN v_setter_issues := v_setter_issues || jsonb_build_array('Tournament must be an Auction League.'); END IF;
    IF v_setter_players = 0 THEN v_setter_issues := v_setter_issues || jsonb_build_array('No approved Setter players are available.'); END IF;
    IF v_active_teams = 0 THEN v_setter_issues := v_setter_issues || jsonb_build_array('At least one active team is required.'); END IF;
    IF v_setter_conflicts > 0 THEN v_setter_issues := v_setter_issues || jsonb_build_array(v_setter_conflicts || ' Setter player(s) are already assigned or routed into auction.'); END IF;
    IF EXISTS (SELECT 1 FROM public.lot_sessions WHERE tournament_id = p_tournament_id AND lot_type = 'SETTER' AND status <> 'CANCELLED') THEN v_setter_issues := v_setter_issues || jsonb_build_array('A Setter lot session already exists.'); END IF;
    IF v_settings.max_squad_size IS NOT NULL AND EXISTS (SELECT 1 FROM public.teams team WHERE team.tournament_id = p_tournament_id AND team.status = 'ACTIVE' AND (SELECT count(*) FROM public.team_players tp WHERE tp.team_id = team.id AND tp.status = 'ACTIVE') >= v_settings.max_squad_size) THEN v_setter_issues := v_setter_issues || jsonb_build_array('One or more teams have no remaining squad capacity.'); END IF;
    v_setter_status := CASE WHEN jsonb_array_length(v_setter_issues) = 0 THEN 'READY' ELSE 'BLOCKED' END;
  END IF;
  IF NOT (v_tournament.format = 'LEAGUE' AND v_tournament.league_mode = 'AUCTION') THEN v_auction_issues := v_auction_issues || jsonb_build_array('Tournament must be an Auction League.'); END IF;
  IF v_active_teams = 0 THEN v_auction_issues := v_auction_issues || jsonb_build_array('At least one active team is required.'); END IF;
  IF v_owned_teams < v_active_teams THEN v_auction_issues := v_auction_issues || jsonb_build_array((v_active_teams - v_owned_teams) || ' active team(s) need an active owner.'); END IF;
  IF COALESCE(v_settings.auction_starting_purse, 0) <= 0 THEN v_auction_issues := v_auction_issues || jsonb_build_array('Team purse must be greater than zero.'); END IF;
  IF COALESCE(v_settings.auction_base_price, 0) <= 0 THEN v_auction_issues := v_auction_issues || jsonb_build_array('Default player base price must be greater than zero.'); END IF;
  IF COALESCE(v_settings.auction_bid_increment, 0) <= 0 THEN v_auction_issues := v_auction_issues || jsonb_build_array('Minimum bid increment must be greater than zero.'); END IF;
  IF v_settings.min_squad_size <= 0 OR (v_settings.max_squad_size IS NOT NULL AND v_settings.max_squad_size < v_settings.min_squad_size) THEN v_auction_issues := v_auction_issues || jsonb_build_array('Squad size limits are invalid.'); END IF;
  IF v_unclassified > 0 THEN v_auction_issues := v_auction_issues || jsonb_build_array(v_unclassified || ' approved player(s) need a classification.'); END IF;
  IF (v_main_players
      + (CASE WHEN v_settings.icon_selection_method = 'AUCTION' THEN v_icon_players ELSE 0 END)
      + (CASE WHEN v_settings.setter_selection_method = 'AUCTION' THEN v_setter_players ELSE 0 END)) = 0 THEN
    v_auction_issues := v_auction_issues || jsonb_build_array('No approved players are eligible for auction.');
  END IF;
  IF v_auction_conflicts > 0 THEN v_auction_issues := v_auction_issues || jsonb_build_array(v_auction_conflicts || ' auction player(s) are already assigned to teams.'); END IF;
  IF v_price_conflicts > 0 THEN v_auction_issues := v_auction_issues || jsonb_build_array(v_price_conflicts || ' auction player(s) have a base price below the tournament floor.'); END IF;
  IF v_route_conflicts > 0 THEN v_auction_issues := v_auction_issues || jsonb_build_array(v_route_conflicts || ' auction player(s) are not eligible under the configured allocation routes.'); END IF;
  v_auction_status := CASE WHEN jsonb_array_length(v_auction_issues) = 0 THEN 'READY' ELSE 'BLOCKED' END;

  RETURN jsonb_build_object(
    'settings', to_jsonb(v_settings), 'icon_lock', v_icon_lock, 'setter_lock', v_setter_lock,
    'readiness', jsonb_build_array(
      jsonb_build_object('key', 'ICON_LOT', 'label', 'Icon Player Lot', 'status', v_icon_status, 'code', CASE WHEN v_icon_status = 'READY' THEN 'ICON_LOT_READY' WHEN v_icon_status = 'NOT_APPLICABLE' THEN 'ICON_LOT_NOT_APPLICABLE' ELSE 'ICON_LOT_BLOCKED' END, 'message', CASE WHEN v_icon_status = 'NOT_APPLICABLE' THEN 'Icon players are configured for Auction.' ELSE NULL END, 'issues', v_icon_issues, 'action', 'special-allocation'),
      jsonb_build_object('key', 'SETTER_LOT', 'label', 'Setter Lot', 'status', v_setter_status, 'code', CASE WHEN v_setter_status = 'READY' THEN 'SETTER_LOT_READY' WHEN v_setter_status = 'NOT_APPLICABLE' THEN 'SETTER_LOT_NOT_APPLICABLE' ELSE 'SETTER_LOT_BLOCKED' END, 'message', CASE WHEN v_setter_status = 'NOT_APPLICABLE' THEN 'Setter players are configured for Auction.' ELSE NULL END, 'issues', v_setter_issues, 'action', 'special-allocation'),
      jsonb_build_object('key', 'AUCTION', 'label', 'Auction', 'status', v_auction_status, 'code', CASE WHEN v_auction_status = 'READY' THEN 'AUCTION_READY' ELSE 'AUCTION_BLOCKED' END, 'message', NULL, 'issues', v_auction_issues, 'action', 'auction-settings')
    ),
    'stages', COALESCE((SELECT jsonb_agg(to_jsonb(stage) ORDER BY stage.sequence) FROM public.tournament_stages stage WHERE stage.tournament_id = p_tournament_id), '[]'::jsonb),
    'rules', COALESCE((SELECT jsonb_agg(to_jsonb(rule) || jsonb_build_object('set_rules', COALESCE((SELECT jsonb_agg(to_jsonb(set_rule) ORDER BY set_rule.set_number) FROM public.volleyball_set_rules set_rule WHERE set_rule.volleyball_rule_id = rule.id), '[]'::jsonb))) FROM public.volleyball_rules rule WHERE rule.tournament_id = p_tournament_id), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_tournament_phase5a_configuration(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tournament_phase5a_configuration(uuid) TO authenticated;

--------------------------------------------------------------------------------
-- 7. DIRECT-WRITE HARDENING FOR AUTHORITATIVE CONFIGURATION
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Organizers can manage settings" ON public.tournament_settings;
DROP POLICY IF EXISTS "Organizers can manage tournament stages" ON public.tournament_stages;
DROP POLICY IF EXISTS "Organizers can manage volleyball rules" ON public.volleyball_rules;
DROP POLICY IF EXISTS "Organizers can manage volleyball set rules" ON public.volleyball_set_rules;

REVOKE INSERT, UPDATE, DELETE ON public.tournament_settings FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.tournament_stages FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.volleyball_rules FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.volleyball_set_rules FROM authenticated;

CREATE POLICY "Organizers can read tournament stages" ON public.tournament_stages FOR SELECT
USING (public.is_tournament_organizer(tournament_id));
CREATE POLICY "Organizers can read volleyball set rules" ON public.volleyball_set_rules FOR SELECT
USING (EXISTS (SELECT 1 FROM public.volleyball_rules rule WHERE rule.id = volleyball_rule_id AND public.is_tournament_organizer(rule.tournament_id)));
