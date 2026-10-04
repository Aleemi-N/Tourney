-- Fix get_scorer_match_state: restore correct response shape for ScorerMatchClient and /scorer page.
-- The 20261002000044 migration overwrote the function with a flat shape that omitted home_team / away_team and nested timeouts object.
-- This restores the proper nested structure expected by ScorerMatchClient while preserving the auto-assign behavior for unassigned matches.

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
      'id', mt.id,
      'team_id', mt.team_id,
      'timeout_number', mt.timeout_number,
      'duration_seconds', mt.duration_seconds,
      'started_at', mt.started_at,
      'remaining_seconds', GREATEST(0, EXTRACT(EPOCH FROM (mt.started_at + (mt.duration_seconds || ' seconds')::interval - now()))::integer)
    ) INTO v_active_timeout
    FROM public.match_timeouts mt
    WHERE mt.match_id = p_match_id AND mt.ended_at IS NULL
      AND now() < mt.started_at + (mt.duration_seconds || ' seconds')::interval
    ORDER BY mt.started_at DESC LIMIT 1;

    SELECT count(*) INTO v_home_timeouts FROM public.match_timeouts WHERE match_set_id = v_active_set_id AND team_id = v_home_id;
    SELECT count(*) INTO v_away_timeouts FROM public.match_timeouts WHERE match_set_id = v_active_set_id AND team_id = v_away_id;
  END IF;

  SELECT jsonb_build_object(
    'match', jsonb_build_object(
      'id', m.id,
      'tournament_id', m.tournament_id,
      'stage_id', m.stage_id,
      'status', m.status,
      'match_number', m.match_number,
      'scheduled_at', m.scheduled_at,
      'venue', m.venue,
      'court', m.court
    ),
    'home_team', jsonb_build_object(
      'id', ht.id,
      'name', ht.name,
      'short_name', ht.short_name
    ),
    'away_team', jsonb_build_object(
      'id', at.id,
      'name', at.name,
      'short_name', at.short_name
    ),
    'sets', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', ms.id,
            'set_number', ms.set_number,
            'target_points', ms.target_points,
            'home_score', ms.home_score,
            'away_score', ms.away_score,
            'status', ms.status,
            'winner_team_id', ms.winner_team_id
          ) ORDER BY ms.set_number
        ) FROM public.match_sets ms WHERE ms.match_id = m.id
      ),
      '[]'::jsonb
    ),
    'timeouts', jsonb_build_object(
      'max_per_set', v_max_timeouts,
      'duration_seconds', v_duration,
      'home_used', v_home_timeouts,
      'away_used', v_away_timeouts,
      'active', v_active_timeout
    )
  ) INTO v_state
  FROM public.matches m
  JOIN public.teams ht ON ht.id = m.home_team_id
  JOIN public.teams at ON at.id = m.away_team_id
  WHERE m.id = p_match_id;

  RETURN v_state;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_scorer_match_state(uuid) TO authenticated;