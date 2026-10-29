-- Allow unassigned match links to be opened and scored by any logged-in scorer or organizer
-- Auto-assigns the user who opens the unassigned link so scores are tracked cleanly in DB

CREATE OR REPLACE FUNCTION public.is_assigned_scorer(m_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM match_scorers
    WHERE match_id = m_id
      AND user_id = (SELECT auth.uid())
  ) OR (
    -- If no specific scorer is assigned to this match yet, allow any authenticated user
    NOT EXISTS (SELECT 1 FROM match_scorers WHERE match_id = m_id)
    AND (SELECT auth.uid()) IS NOT NULL
  );
$$;

-- Enriched get_scorer_match_state: auto-assign scorer when match is unassigned
CREATE OR REPLACE FUNCTION public.get_scorer_match_state(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tournament_id uuid;
  v_stage_id uuid;
  v_state jsonb;
  v_active_set_id uuid;
  v_max_timeouts integer;
  v_duration integer;
  v_active_timeout jsonb;
  v_home_id uuid;
  v_away_id uuid;
  v_home_timeouts integer := 0;
  v_away_timeouts integer := 0;
  v_actor uuid := auth.uid();
BEGIN
  SELECT tournament_id, stage_id, home_team_id, away_team_id
  INTO v_tournament_id, v_stage_id, v_home_id, v_away_id
  FROM public.matches WHERE id = p_match_id;

  IF v_tournament_id IS NULL THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  -- Auto-assign if match currently has no assigned scorer and user is logged in
  IF v_actor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.match_scorers WHERE match_id = p_match_id) THEN
    INSERT INTO public.match_scorers (match_id, user_id, assigned_by)
    VALUES (p_match_id, v_actor, v_actor)
    ON CONFLICT (match_id, user_id) DO NOTHING;
  END IF;

  IF NOT (public.is_assigned_scorer(p_match_id) OR public.is_tournament_organizer(v_tournament_id)) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Find active set
  SELECT id INTO v_active_set_id
  FROM public.match_sets WHERE match_id = p_match_id AND status IN ('PENDING', 'LIVE')
  ORDER BY set_number ASC LIMIT 1;

  -- Read rule config
  SELECT timeouts_per_set, timeout_duration_seconds INTO v_max_timeouts, v_duration
  FROM public.volleyball_rules
  WHERE tournament_id = v_tournament_id AND (stage_id = v_stage_id OR stage_id IS NULL)
  ORDER BY stage_id NULLS LAST LIMIT 1;

  v_max_timeouts := COALESCE(v_max_timeouts, 2);
  v_duration := COALESCE(v_duration, 15);

  IF v_active_set_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', t.id,
      'team_id', t.team_id,
      'requested_at', t.requested_at,
      'duration_seconds', t.duration_seconds,
      'expires_at', to_char(t.requested_at + (t.duration_seconds || ' seconds')::interval, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'is_active', (t.requested_at + (t.duration_seconds || ' seconds')::interval > clock_timestamp())
    ) INTO v_active_timeout
    FROM public.match_timeouts t
    WHERE t.match_set_id = v_active_set_id AND t.completed_at IS NULL
      AND (t.requested_at + (t.duration_seconds || ' seconds')::interval > clock_timestamp())
    ORDER BY t.requested_at DESC LIMIT 1;

    SELECT count(*) INTO v_home_timeouts FROM public.match_timeouts WHERE match_set_id = v_active_set_id AND team_id = v_home_id;
    SELECT count(*) INTO v_away_timeouts FROM public.match_timeouts WHERE match_set_id = v_active_set_id AND team_id = v_away_id;
  END IF;

  SELECT jsonb_build_object(
    'match', to_jsonb(m),
    'sets', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.set_number) FROM public.match_sets s WHERE s.match_id = p_match_id), '[]'::jsonb),
    'events', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC) FROM public.match_events e WHERE e.match_id = p_match_id), '[]'::jsonb),
    'max_timeouts_per_set', v_max_timeouts,
    'timeout_duration_seconds', v_duration,
    'home_timeouts_used', v_home_timeouts,
    'away_timeouts_used', v_away_timeouts,
    'active_timeout', v_active_timeout
  ) INTO v_state
  FROM public.matches m WHERE m.id = p_match_id;

  RETURN v_state;
END;
$$;
