-- v2: manual score correction and match reset.
-- A scorer may correct or reset while the match is LIVE; only an organizer may
-- touch a COMPLETED match. Both append a CORRECTION event and an audit entry.

-- Reopens a completed match: clears the winner and the teams it advanced into
-- knockout slots (refused once those matches have started or the next stage exists).
CREATE FUNCTION public.rollback_match_result(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_next record;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF v_match.status <> 'COMPLETED' THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.tournament_progression_plans WHERE source_stage_id = v_match.stage_id) THEN
    RAISE EXCEPTION 'This league result is locked: the next stage was already created from these standings';
  END IF;

  FOR v_next IN
    SELECT nm.id, nm.status, x.slot
    FROM (VALUES (v_match.next_match_id, v_match.next_match_slot),
                 (v_match.loser_next_match_id, v_match.loser_next_match_slot)) AS x(id, slot)
    JOIN public.matches nm ON nm.id = x.id
    FOR UPDATE OF nm
  LOOP
    IF v_next.status <> 'SCHEDULED' OR EXISTS (SELECT 1 FROM public.score_events WHERE match_id = v_next.id) THEN
      RAISE EXCEPTION 'The next knockout match has already started, so this result can no longer be changed';
    END IF;
    UPDATE public.matches
    SET home_team_id = CASE WHEN v_next.slot = 'HOME' THEN NULL ELSE home_team_id END,
        away_team_id = CASE WHEN v_next.slot = 'AWAY' THEN NULL ELSE away_team_id END,
        updated_at = now()
    WHERE id = v_next.id;
    DELETE FROM public.match_sets WHERE match_id = v_next.id;
  END LOOP;

  UPDATE public.matches SET status = 'LIVE', winner_team_id = NULL, updated_at = now() WHERE id = p_match_id;
  UPDATE public.tournament_stages SET status = 'ACTIVE' WHERE id = v_match.stage_id AND status = 'COMPLETED';
  UPDATE public.tournaments SET status = 'LIVE', updated_at = now() WHERE id = v_match.tournament_id AND status = 'COMPLETED';
END;
$$;
REVOKE ALL ON FUNCTION public.rollback_match_result(uuid) FROM PUBLIC, anon, authenticated;

-- Undo replays POINT/UNDO events; after a manual correction that history no longer
-- matches the score, so undo is blocked until the next point is scored.
ALTER FUNCTION public.undo_last_score_event(uuid) RENAME TO undo_last_score_event_core;
REVOKE ALL ON FUNCTION public.undo_last_score_event_core(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.undo_last_score_event(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (SELECT event_type FROM public.score_events WHERE match_id = p_match_id ORDER BY sequence_number DESC LIMIT 1) = 'CORRECTION' THEN
    RAISE EXCEPTION 'The score was corrected manually; correct it again instead of undoing';
  END IF;
  RETURN public.undo_last_score_event_core(p_match_id);
END;
$$;
REVOKE ALL ON FUNCTION public.undo_last_score_event(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_last_score_event(uuid) TO authenticated;

-- Sets the score of the latest started set and re-decides it under the match's rules.
CREATE FUNCTION public.correct_set_score(p_match_id uuid, p_set_number integer, p_home_score integer, p_away_score integer, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_set public.match_sets%ROWTYPE;
  v_latest integer;
  v_winner uuid;
  v_home_won integer;
  v_away_won integer;
  v_sets_to_win integer;
  v_win_by_two boolean;
  v_org uuid;
  v_lead integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('match_scoring:' || p_match_id::text));
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF v_match.id IS NULL THEN RAISE EXCEPTION 'Match not found'; END IF;

  IF v_match.status = 'COMPLETED' THEN
    IF NOT public.is_tournament_organizer(v_match.tournament_id) THEN
      RAISE EXCEPTION 'Only an organizer can correct a completed match';
    END IF;
  ELSIF v_match.status = 'LIVE' THEN
    IF NOT (public.is_assigned_scorer(p_match_id) OR public.is_tournament_organizer(v_match.tournament_id)) THEN
      RAISE EXCEPTION 'Unauthorized to score this match';
    END IF;
  ELSE
    RAISE EXCEPTION 'Only a live or completed match can be corrected';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF p_home_score < 0 OR p_away_score < 0 THEN RAISE EXCEPTION 'Scores cannot be negative'; END IF;

  SELECT max(set_number) INTO v_latest FROM public.match_sets
  WHERE match_id = p_match_id AND (status <> 'PENDING' OR home_score + away_score > 0);
  IF p_set_number IS DISTINCT FROM v_latest THEN
    RAISE EXCEPTION 'Only the latest started set (set %) can be corrected', v_latest;
  END IF;
  SELECT * INTO v_set FROM public.match_sets WHERE match_id = p_match_id AND set_number = p_set_number FOR UPDATE;

  v_sets_to_win := COALESCE(v_match.sets_to_win, 2);
  v_win_by_two := COALESCE(v_match.win_by_two, true);
  v_lead := CASE WHEN v_win_by_two THEN 2 ELSE 1 END;

  -- Does this score end the set? It must be a legal finishing score, never past it.
  IF GREATEST(p_home_score, p_away_score) >= v_set.target_points THEN
    IF abs(p_home_score - p_away_score) < v_lead THEN
      NULL; -- still in play (deuce)
    ELSIF v_win_by_two AND GREATEST(p_home_score, p_away_score) > v_set.target_points
          AND abs(p_home_score - p_away_score) > 2 THEN
      RAISE EXCEPTION 'That score cannot occur: the set would have ended earlier';
    ELSIF NOT v_win_by_two AND GREATEST(p_home_score, p_away_score) > v_set.target_points THEN
      RAISE EXCEPTION 'That score cannot occur: the set would have ended earlier';
    ELSE
      v_winner := CASE WHEN p_home_score > p_away_score THEN v_match.home_team_id ELSE v_match.away_team_id END;
    END IF;
  END IF;

  IF v_match.status = 'COMPLETED' THEN
    PERFORM public.rollback_match_result(p_match_id);
  END IF;

  UPDATE public.match_sets
  SET home_score = p_home_score, away_score = p_away_score,
      status = CASE WHEN v_winner IS NULL THEN 'LIVE' ELSE 'COMPLETED' END,
      winner_team_id = v_winner,
      started_at = COALESCE(started_at, now()),
      completed_at = CASE WHEN v_winner IS NULL THEN NULL ELSE COALESCE(completed_at, now()) END
  WHERE id = v_set.id;

  INSERT INTO public.score_events (match_id, match_set_id, sequence_number, event_type, home_score_after, away_score_after, created_by)
  SELECT p_match_id, v_set.id, COALESCE(max(sequence_number), 0) + 1, 'CORRECTION', p_home_score, p_away_score, auth.uid()
  FROM public.score_events WHERE match_id = p_match_id;

  SELECT count(*) FILTER (WHERE winner_team_id = v_match.home_team_id),
         count(*) FILTER (WHERE winner_team_id = v_match.away_team_id)
  INTO v_home_won, v_away_won FROM public.match_sets WHERE match_id = p_match_id;

  IF v_home_won >= v_sets_to_win THEN
    UPDATE public.matches SET status = 'COMPLETED', winner_team_id = v_match.home_team_id, updated_at = now() WHERE id = p_match_id;
  ELSIF v_away_won >= v_sets_to_win THEN
    UPDATE public.matches SET status = 'COMPLETED', winner_team_id = v_match.away_team_id, updated_at = now() WHERE id = p_match_id;
  ELSIF v_winner IS NOT NULL THEN
    UPDATE public.match_sets SET status = 'LIVE', started_at = now()
    WHERE match_id = p_match_id AND set_number = p_set_number + 1 AND status = 'PENDING';
  END IF;

  SELECT organization_id INTO v_org FROM public.tournaments WHERE id = v_match.tournament_id;
  INSERT INTO public.audit_logs (organization_id, tournament_id, user_id, action, entity_type, entity_id, before_json, after_json, reason)
  VALUES (v_org, v_match.tournament_id, auth.uid(), 'SCORE_CORRECTED', 'MATCH', p_match_id,
          jsonb_build_object('set', p_set_number, 'home', v_set.home_score, 'away', v_set.away_score, 'match_status', v_match.status),
          jsonb_build_object('set', p_set_number, 'home', p_home_score, 'away', p_away_score),
          btrim(p_reason));

  RETURN jsonb_build_object('home_score', p_home_score, 'away_score', p_away_score, 'set_winner', v_winner);
END;
$$;
REVOKE ALL ON FUNCTION public.correct_set_score(uuid, integer, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_set_score(uuid, integer, integer, integer, text) TO authenticated;

-- Wipes the score and puts the match back to SCHEDULED, ready to be played again.
CREATE FUNCTION public.reset_match(p_match_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_first uuid;
  v_org uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('match_scoring:' || p_match_id::text));
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF v_match.id IS NULL THEN RAISE EXCEPTION 'Match not found'; END IF;

  IF v_match.status = 'COMPLETED' THEN
    IF NOT public.is_tournament_organizer(v_match.tournament_id) THEN
      RAISE EXCEPTION 'Only an organizer can reset a completed match';
    END IF;
  ELSIF v_match.status = 'LIVE' THEN
    IF NOT (public.is_assigned_scorer(p_match_id) OR public.is_tournament_organizer(v_match.tournament_id)) THEN
      RAISE EXCEPTION 'Unauthorized to score this match';
    END IF;
  ELSE
    RAISE EXCEPTION 'Only a live or completed match can be reset';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;

  IF v_match.status = 'COMPLETED' THEN
    PERFORM public.rollback_match_result(p_match_id);
  END IF;

  SELECT id INTO v_first FROM public.match_sets WHERE match_id = p_match_id ORDER BY set_number LIMIT 1;
  INSERT INTO public.score_events (match_id, match_set_id, sequence_number, event_type, home_score_after, away_score_after, created_by)
  SELECT p_match_id, v_first, COALESCE(max(sequence_number), 0) + 1, 'CORRECTION', 0, 0, auth.uid()
  FROM public.score_events WHERE match_id = p_match_id;

  UPDATE public.match_sets
  SET home_score = 0, away_score = 0, status = 'PENDING', winner_team_id = NULL, started_at = NULL, completed_at = NULL
  WHERE match_id = p_match_id;
  DELETE FROM public.match_timeouts WHERE match_id = p_match_id;
  UPDATE public.matches SET status = 'SCHEDULED', winner_team_id = NULL, updated_at = now() WHERE id = p_match_id;

  SELECT organization_id INTO v_org FROM public.tournaments WHERE id = v_match.tournament_id;
  INSERT INTO public.audit_logs (organization_id, tournament_id, user_id, action, entity_type, entity_id, before_json, after_json, reason)
  VALUES (v_org, v_match.tournament_id, auth.uid(), 'MATCH_RESET', 'MATCH', p_match_id,
          jsonb_build_object('status', v_match.status), jsonb_build_object('status', 'SCHEDULED'), btrim(p_reason));

  RETURN jsonb_build_object('match_id', p_match_id, 'status', 'SCHEDULED');
END;
$$;
REVOKE ALL ON FUNCTION public.reset_match(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_match(uuid, text) TO authenticated;
