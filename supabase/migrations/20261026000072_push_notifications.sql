-- v2: push notifications for the mobile app.
-- Devices register an Expo push token for the signed-in user. Database triggers queue a message in
-- push_outbox for the moments people care about (a match starts, a player goes on the block, you are
-- outbid, it is your team's turn in a lot draw); the API's dispatcher sends the queue to Expo.
-- Neither table is readable or writable by the apps directly: only the two functions below.

CREATE TABLE public.push_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_tokens_user_idx ON public.push_tokens (user_id);

CREATE TABLE public.push_outbox (
  id bigserial PRIMARY KEY,
  user_ids uuid[] NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX push_outbox_pending_idx ON public.push_outbox (id) WHERE sent_at IS NULL;

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_tokens, public.push_outbox FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.push_outbox_id_seq FROM PUBLIC, anon, authenticated;

--------------------------------------------------------------------------------
-- Device registration
--------------------------------------------------------------------------------
CREATE FUNCTION public.register_push_token(p_token text, p_platform text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_token IS NULL OR length(p_token) > 200 OR p_token !~ '^Expo(nent)?PushToken\[[^\]]+\]$' THEN
    RAISE EXCEPTION 'Invalid push token';
  END IF;
  IF p_platform NOT IN ('ios', 'android') THEN RAISE EXCEPTION 'Invalid platform'; END IF;
  -- A token belongs to one device; signing in as someone else on that device moves it.
  INSERT INTO public.push_tokens (token, user_id, platform)
  VALUES (p_token, auth.uid(), p_platform)
  ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = now();
END;
$$;

CREATE FUNCTION public.unregister_push_token(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  DELETE FROM public.push_tokens WHERE token = p_token AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.register_push_token(text, text), public.unregister_push_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text), public.unregister_push_token(text) TO authenticated;

--------------------------------------------------------------------------------
-- Queueing
--------------------------------------------------------------------------------
CREATE FUNCTION public.enqueue_push(p_user_ids uuid[], p_title text, p_body text, p_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT u), '{}') INTO v_ids FROM unnest(p_user_ids) AS u WHERE u IS NOT NULL;
  -- Nobody to tell, or nobody with a registered device.
  IF cardinality(v_ids) = 0 OR NOT EXISTS (SELECT 1 FROM public.push_tokens WHERE user_id = ANY (v_ids)) THEN RETURN; END IF;
  INSERT INTO public.push_outbox (user_ids, title, body, data) VALUES (v_ids, left(p_title, 120), left(p_body, 300), COALESCE(p_data, '{}'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_push(uuid[], text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- Active owners of a team.
CREATE FUNCTION public.push_team_owners(p_team_id uuid)
RETURNS uuid[]
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(array_agg(user_id), '{}') FROM public.team_owners WHERE team_id = p_team_id AND status = 'ACTIVE';
$$;
REVOKE ALL ON FUNCTION public.push_team_owners(uuid) FROM PUBLIC, anon, authenticated;

--------------------------------------------------------------------------------
-- 1. A match goes live: owners and squad players of both teams.
--------------------------------------------------------------------------------
CREATE FUNCTION public.push_match_live()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_users uuid[];
  v_home text;
  v_away text;
BEGIN
  IF NEW.status <> 'LIVE' OR OLD.status = 'LIVE' OR NEW.home_team_id IS NULL OR NEW.away_team_id IS NULL THEN RETURN NULL; END IF;
  SELECT COALESCE(array_agg(DISTINCT u), '{}') INTO v_users FROM (
    SELECT user_id AS u FROM public.team_owners WHERE team_id IN (NEW.home_team_id, NEW.away_team_id) AND status = 'ACTIVE'
    UNION
    SELECT pp.user_id FROM public.team_players tp JOIN public.player_profiles pp ON pp.id = tp.player_id
    WHERE tp.team_id IN (NEW.home_team_id, NEW.away_team_id) AND tp.status = 'ACTIVE' AND pp.user_id IS NOT NULL
  ) s;
  SELECT name INTO v_home FROM public.teams WHERE id = NEW.home_team_id;
  SELECT name INTO v_away FROM public.teams WHERE id = NEW.away_team_id;
  PERFORM public.enqueue_push(v_users, 'Match started', v_home || ' vs ' || v_away || ' is live now.',
    jsonb_build_object('kind', 'MATCH_LIVE', 'matchId', NEW.id));
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.push_match_live() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER push_match_live AFTER UPDATE OF status ON public.matches FOR EACH ROW EXECUTE FUNCTION public.push_match_live();

--------------------------------------------------------------------------------
-- 2. A player goes on the block: every team's owners in that tournament.
--------------------------------------------------------------------------------
CREATE FUNCTION public.push_auction_player_live()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tournament uuid;
  v_name text;
  v_team record;
BEGIN
  IF NEW.status <> 'LIVE' OR OLD.status = 'LIVE' THEN RETURN NULL; END IF;
  SELECT tournament_id INTO v_tournament FROM public.auctions WHERE id = NEW.auction_id;
  SELECT display_name INTO v_name FROM public.player_profiles WHERE id = NEW.player_id;
  FOR v_team IN SELECT id FROM public.teams WHERE tournament_id = v_tournament AND status = 'ACTIVE' LOOP
    PERFORM public.enqueue_push(public.push_team_owners(v_team.id), 'On the block', COALESCE(v_name, 'A player') || ' is up for bidding.',
      jsonb_build_object('kind', 'AUCTION_PLAYER_LIVE', 'teamId', v_team.id));
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.push_auction_player_live() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER push_auction_player_live AFTER UPDATE OF status ON public.auction_players FOR EACH ROW EXECUTE FUNCTION public.push_auction_player_live();

--------------------------------------------------------------------------------
-- 3. You were outbid: the owners of the team that was leading.
--------------------------------------------------------------------------------
CREATE FUNCTION public.push_auction_outbid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_previous uuid;
  v_name text;
  v_team text;
BEGIN
  SELECT team_id INTO v_previous FROM public.auction_bids
  WHERE auction_player_id = NEW.auction_player_id AND id <> NEW.id AND created_at <= NEW.created_at
  ORDER BY amount DESC, created_at DESC LIMIT 1;
  IF v_previous IS NULL OR v_previous = NEW.team_id THEN RETURN NULL; END IF;
  SELECT pp.display_name INTO v_name FROM public.auction_players ap JOIN public.player_profiles pp ON pp.id = ap.player_id WHERE ap.id = NEW.auction_player_id;
  SELECT name INTO v_team FROM public.teams WHERE id = NEW.team_id;
  PERFORM public.enqueue_push(public.push_team_owners(v_previous), 'You were outbid',
    v_team || ' bid ₹' || trim(to_char(NEW.amount, 'FM999,999,999,990')) || ' for ' || COALESCE(v_name, 'the player') || '.',
    jsonb_build_object('kind', 'AUCTION_OUTBID', 'teamId', v_previous));
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.push_auction_outbid() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER push_auction_outbid AFTER INSERT ON public.auction_bids FOR EACH ROW EXECUTE FUNCTION public.push_auction_outbid();

--------------------------------------------------------------------------------
-- 4. A lot draw turn starts: the owners of the team that picks.
--------------------------------------------------------------------------------
CREATE FUNCTION public.push_lot_turn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status <> 'ACTIVE' OR (TG_OP = 'UPDATE' AND OLD.status = 'ACTIVE') THEN RETURN NULL; END IF;
  PERFORM public.enqueue_push(public.push_team_owners(NEW.team_id), 'Your turn to pick',
    'It is your team''s turn in the lot draw.', jsonb_build_object('kind', 'LOT_TURN', 'teamId', NEW.team_id));
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.push_lot_turn() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER push_lot_turn AFTER INSERT OR UPDATE OF status ON public.lot_turns FOR EACH ROW EXECUTE FUNCTION public.push_lot_turn();
