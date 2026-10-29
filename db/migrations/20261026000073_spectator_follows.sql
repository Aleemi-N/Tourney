-- v2: spectators follow teams, matches and tournaments and get push alerts without an account.
-- A device registers its Expo push token (signed in or not). Following is stored against the token, not a user.
-- Alerts: match started, final result, and schedule changes (moved, postponed, cancelled).
-- Owners and squad players of the teams involved also get schedule-change alerts.

ALTER TABLE public.push_tokens ALTER COLUMN user_id DROP NOT NULL;

CREATE TABLE public.push_follows (
  token text NOT NULL REFERENCES public.push_tokens(token) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('TEAM', 'MATCH', 'TOURNAMENT')),
  target_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (token, kind, target_id)
);
CREATE INDEX push_follows_target_idx ON public.push_follows (kind, target_id);
ALTER TABLE public.push_follows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_follows FROM PUBLIC, anon, authenticated;

ALTER TABLE public.push_outbox ADD COLUMN tokens text[] NOT NULL DEFAULT '{}';

--------------------------------------------------------------------------------
-- Device registration, open to signed-out devices. Signing in links the token to the user;
-- an anonymous call never takes a token away from a user it is linked to.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_push_token(p_token text, p_platform text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_token IS NULL OR length(p_token) > 200 OR p_token !~ '^Expo(nent)?PushToken\[[^\]]+\]$' THEN
    RAISE EXCEPTION 'Invalid push token';
  END IF;
  IF p_platform NOT IN ('ios', 'android') THEN RAISE EXCEPTION 'Invalid platform'; END IF;
  INSERT INTO public.push_tokens (token, user_id, platform)
  VALUES (p_token, auth.uid(), p_platform)
  ON CONFLICT (token) DO UPDATE
    SET user_id = COALESCE(auth.uid(), public.push_tokens.user_id), platform = EXCLUDED.platform, updated_at = now();
END;
$$;

-- Signing out: stop sending this person's messages to the device, but keep what the device follows.
CREATE OR REPLACE FUNCTION public.unregister_push_token(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE public.push_tokens SET user_id = NULL, updated_at = now() WHERE token = p_token AND user_id = auth.uid();
END;
$$;

-- Turning notifications off: forget the device and everything it follows.
CREATE FUNCTION public.forget_push_device(p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  DELETE FROM public.push_tokens WHERE token = p_token;
$$;

CREATE FUNCTION public.follow_target(p_token text, p_kind text, p_target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.push_tokens WHERE token = p_token) THEN RAISE EXCEPTION 'Unknown device'; END IF;
  IF p_kind NOT IN ('TEAM', 'MATCH', 'TOURNAMENT') THEN RAISE EXCEPTION 'Invalid kind'; END IF;
  IF p_kind = 'TEAM' THEN v_ok := EXISTS (SELECT 1 FROM public.teams WHERE id = p_target_id);
  ELSIF p_kind = 'MATCH' THEN v_ok := EXISTS (SELECT 1 FROM public.matches WHERE id = p_target_id);
  ELSE v_ok := EXISTS (SELECT 1 FROM public.tournaments WHERE id = p_target_id);
  END IF;
  IF NOT v_ok THEN RAISE EXCEPTION 'Nothing to follow'; END IF;
  IF (SELECT count(*) FROM public.push_follows WHERE token = p_token) >= 100 THEN RAISE EXCEPTION 'Too many follows'; END IF;
  INSERT INTO public.push_follows (token, kind, target_id) VALUES (p_token, p_kind, p_target_id) ON CONFLICT DO NOTHING;
END;
$$;

CREATE FUNCTION public.unfollow_target(p_token text, p_kind text, p_target_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  DELETE FROM public.push_follows WHERE token = p_token AND kind = p_kind AND target_id = p_target_id;
$$;

CREATE FUNCTION public.get_push_follows(p_token text)
RETURNS TABLE (kind text, target_id uuid, name text)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT f.kind, f.target_id,
    CASE f.kind
      WHEN 'TEAM' THEN (SELECT t.name FROM public.teams t WHERE t.id = f.target_id)
      WHEN 'TOURNAMENT' THEN (SELECT t.name FROM public.tournaments t WHERE t.id = f.target_id)
      ELSE (SELECT h.name || ' vs ' || a.name FROM public.matches m JOIN public.teams h ON h.id = m.home_team_id JOIN public.teams a ON a.id = m.away_team_id WHERE m.id = f.target_id)
    END
  FROM public.push_follows f WHERE f.token = p_token ORDER BY f.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.register_push_token(text, text), public.unregister_push_token(text), public.forget_push_device(text),
  public.follow_target(text, text, uuid), public.unfollow_target(text, text, uuid), public.get_push_follows(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text), public.forget_push_device(text), public.follow_target(text, text, uuid),
  public.unfollow_target(text, text, uuid), public.get_push_follows(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_push_token(text) TO authenticated;

--------------------------------------------------------------------------------
-- Queueing for followers
--------------------------------------------------------------------------------
DROP FUNCTION public.enqueue_push(uuid[], text, text, jsonb);
CREATE FUNCTION public.enqueue_push(p_user_ids uuid[], p_title text, p_body text, p_data jsonb, p_tokens text[] DEFAULT '{}')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ids uuid[];
  v_tokens text[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT u), '{}') INTO v_ids FROM unnest(COALESCE(p_user_ids, '{}')) AS u WHERE u IS NOT NULL;
  SELECT COALESCE(array_agg(DISTINCT x), '{}') INTO v_tokens FROM unnest(COALESCE(p_tokens, '{}')) AS x WHERE x IS NOT NULL;
  IF cardinality(v_ids) = 0 AND cardinality(v_tokens) = 0 THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.push_tokens WHERE user_id = ANY (v_ids) OR token = ANY (v_tokens)) THEN RETURN; END IF;
  INSERT INTO public.push_outbox (user_ids, tokens, title, body, data)
  VALUES (v_ids, v_tokens, left(p_title, 120), left(p_body, 300), COALESCE(p_data, '{}'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_push(uuid[], text, text, jsonb, text[]) FROM PUBLIC, anon, authenticated;

-- Devices following a match, either of its teams, or its tournament.
CREATE FUNCTION public.push_match_followers(p_match_id uuid, p_home uuid, p_away uuid, p_tournament uuid)
RETURNS text[]
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(array_agg(DISTINCT token), '{}') FROM public.push_follows
  WHERE (kind = 'MATCH' AND target_id = p_match_id) OR (kind = 'TEAM' AND target_id IN (p_home, p_away)) OR (kind = 'TOURNAMENT' AND target_id = p_tournament);
$$;
REVOKE ALL ON FUNCTION public.push_match_followers(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Owners and squad players of both teams.
CREATE FUNCTION public.push_match_people(p_home uuid, p_away uuid)
RETURNS uuid[]
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(array_agg(DISTINCT u), '{}') FROM (
    SELECT user_id AS u FROM public.team_owners WHERE team_id IN (p_home, p_away) AND status = 'ACTIVE'
    UNION
    SELECT pp.user_id FROM public.team_players tp JOIN public.player_profiles pp ON pp.id = tp.player_id
    WHERE tp.team_id IN (p_home, p_away) AND tp.status = 'ACTIVE' AND pp.user_id IS NOT NULL
  ) s;
$$;
REVOKE ALL ON FUNCTION public.push_match_people(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Match went live: people involved plus followers.
CREATE OR REPLACE FUNCTION public.push_match_live()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_home text;
  v_away text;
BEGIN
  IF NEW.status <> 'LIVE' OR OLD.status = 'LIVE' OR NEW.home_team_id IS NULL OR NEW.away_team_id IS NULL THEN RETURN NULL; END IF;
  SELECT name INTO v_home FROM public.teams WHERE id = NEW.home_team_id;
  SELECT name INTO v_away FROM public.teams WHERE id = NEW.away_team_id;
  PERFORM public.enqueue_push(public.push_match_people(NEW.home_team_id, NEW.away_team_id), 'Match started', v_home || ' vs ' || v_away || ' is live now.',
    jsonb_build_object('kind', 'MATCH_LIVE', 'matchId', NEW.id),
    public.push_match_followers(NEW.id, NEW.home_team_id, NEW.away_team_id, NEW.tournament_id));
  RETURN NULL;
END;
$$;

-- Final result: followers only (the people involved were there).
CREATE FUNCTION public.push_match_final()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_home text;
  v_away text;
  v_hs integer;
  v_as integer;
BEGIN
  IF NEW.status <> 'COMPLETED' OR OLD.status = 'COMPLETED' OR NEW.home_team_id IS NULL OR NEW.away_team_id IS NULL THEN RETURN NULL; END IF;
  SELECT name INTO v_home FROM public.teams WHERE id = NEW.home_team_id;
  SELECT name INTO v_away FROM public.teams WHERE id = NEW.away_team_id;
  SELECT count(*) FILTER (WHERE winner_team_id = NEW.home_team_id), count(*) FILTER (WHERE winner_team_id = NEW.away_team_id)
    INTO v_hs, v_as FROM public.match_sets WHERE match_id = NEW.id;
  PERFORM public.enqueue_push('{}', 'Final result', v_home || ' ' || v_hs || ' – ' || v_as || ' ' || v_away,
    jsonb_build_object('kind', 'MATCH_FINAL', 'matchId', NEW.id),
    public.push_match_followers(NEW.id, NEW.home_team_id, NEW.away_team_id, NEW.tournament_id));
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.push_match_final() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER push_match_final AFTER UPDATE OF status ON public.matches FOR EACH ROW EXECUTE FUNCTION public.push_match_final();

-- The schedule moved, or the match was postponed or cancelled.
CREATE FUNCTION public.push_match_schedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_home text;
  v_away text;
  v_title text;
  v_body text;
BEGIN
  IF NEW.home_team_id IS NULL OR NEW.away_team_id IS NULL OR OLD.status IN ('COMPLETED', 'LIVE') THEN RETURN NULL; END IF;
  IF NEW.status IN ('POSTPONED', 'CANCELLED') AND OLD.status IS DISTINCT FROM NEW.status THEN
    v_title := CASE NEW.status WHEN 'POSTPONED' THEN 'Match postponed' ELSE 'Match cancelled' END;
  ELSIF NEW.status = 'SCHEDULED' AND OLD.scheduled_at IS NOT NULL AND NEW.scheduled_at IS NOT NULL AND OLD.scheduled_at <> NEW.scheduled_at THEN
    v_title := 'Match rescheduled';
  ELSE
    RETURN NULL;
  END IF;
  SELECT name INTO v_home FROM public.teams WHERE id = NEW.home_team_id;
  SELECT name INTO v_away FROM public.teams WHERE id = NEW.away_team_id;
  v_body := v_home || ' vs ' || v_away;
  IF v_title = 'Match rescheduled' THEN
    v_body := v_body || ' is now ' || to_char(NEW.scheduled_at AT TIME ZONE 'Asia/Kolkata', 'Dy DD Mon, HH12:MI AM') || ' IST.';
  ELSE
    v_body := v_body || ' will not be played at the planned time.';
  END IF;
  PERFORM public.enqueue_push(public.push_match_people(NEW.home_team_id, NEW.away_team_id), v_title, v_body,
    jsonb_build_object('kind', 'MATCH_SCHEDULE', 'matchId', NEW.id),
    public.push_match_followers(NEW.id, NEW.home_team_id, NEW.away_team_id, NEW.tournament_id));
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.push_match_schedule() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER push_match_schedule AFTER UPDATE OF scheduled_at, status ON public.matches FOR EACH ROW EXECUTE FUNCTION public.push_match_schedule();
