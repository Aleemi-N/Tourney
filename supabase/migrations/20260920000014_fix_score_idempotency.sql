-- 20260920000014_fix_score_idempotency.sql
-- Implement strict idempotency for award_point to prevent duplicate/retried scoring requests

-- The UNIQUE (match_id, idempotency_key) constraint already exists on score_events.
-- Reasoning for (match_id, idempotency_key) scope rather than global:
-- By scoping idempotency to the match, we prevent accidental cross-match collisions if the client 
-- uses a naive/sequential idempotency token (e.g., "point-1", "point-2"). 
-- It strictly boundaries the idempotency to the event stream of the specific match being scored.

DROP FUNCTION IF EXISTS public.award_point(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.award_point(
  p_match_id uuid,
  p_team_id uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id uuid;
  v_stage_id uuid;
  v_match_status text;
  v_home_team_id uuid;
  v_away_team_id uuid;
  v_set_id uuid;
  v_set_number integer;
  v_home_score integer;
  v_away_score integer;
  v_target_points integer;
  v_rule_id uuid;
  v_win_by_two boolean;
  v_sets_to_win integer;
  v_sequence bigint;
  v_is_home boolean;
  v_set_winner uuid;
  v_exists boolean;
  v_existing_result jsonb;
BEGIN
  -- 0. Validate Idempotency Key
  IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'Idempotency key is required';
  END IF;

  -- Early return if this key has already been processed (optimistic check)
  SELECT true INTO v_exists
  FROM score_events 
  WHERE match_id = p_match_id AND idempotency_key = p_idempotency_key;

  IF v_exists THEN
    -- Return the current score state so the client is in sync, without mutating
    SELECT jsonb_build_object('home_score', home_score, 'away_score', away_score, 'set_winner', winner_team_id)
    INTO v_existing_result
    FROM match_sets 
    WHERE match_id = p_match_id AND status IN ('PENDING', 'LIVE', 'COMPLETED')
    ORDER BY set_number DESC LIMIT 1;
    
    RETURN v_existing_result;
  END IF;

  -- 1. Validate Scorer or Organizer
  SELECT tournament_id, stage_id, status, home_team_id, away_team_id 
  INTO v_tournament_id, v_stage_id, v_match_status, v_home_team_id, v_away_team_id
  FROM matches WHERE id = p_match_id FOR UPDATE;

  IF NOT (is_assigned_scorer(p_match_id) OR is_tournament_organizer(v_tournament_id)) THEN
    RAISE EXCEPTION 'Unauthorized to score this match';
  END IF;

  IF v_match_status <> 'LIVE' THEN
    IF v_match_status = 'SCHEDULED' THEN
      UPDATE matches SET status = 'LIVE' WHERE id = p_match_id;
    ELSE
      RAISE EXCEPTION 'Match is not LIVE or SCHEDULED';
    END IF;
  END IF;

  IF p_team_id = v_home_team_id THEN
    v_is_home := true;
  ELSIF p_team_id = v_away_team_id THEN
    v_is_home := false;
  ELSE
    RAISE EXCEPTION 'Team is not part of this match';
  END IF;

  -- 2. Lock active set
  SELECT id, set_number, home_score, away_score, target_points
  INTO v_set_id, v_set_number, v_home_score, v_away_score, v_target_points
  FROM match_sets WHERE match_id = p_match_id AND status IN ('PENDING', 'LIVE')
  ORDER BY set_number ASC LIMIT 1 FOR UPDATE;

  IF v_set_id IS NULL THEN
    RAISE EXCEPTION 'No active set found';
  END IF;

  -- Ensure set is LIVE
  UPDATE match_sets SET status = 'LIVE', started_at = COALESCE(started_at, now())
  WHERE id = v_set_id;

  -- 3. Fetch Volleyball Rules
  SELECT id, sets_to_win, win_by_two INTO v_rule_id, v_sets_to_win, v_win_by_two
  FROM volleyball_rules 
  WHERE tournament_id = v_tournament_id AND (stage_id = v_stage_id OR stage_id IS NULL)
  ORDER BY stage_id NULLS LAST LIMIT 1;

  -- Check if set has a specific target override
  SELECT COALESCE(
    (SELECT target_points FROM volleyball_set_rules WHERE volleyball_rule_id = v_rule_id AND set_number = v_set_number),
    v_target_points
  ) INTO v_target_points;

  -- 4. Calculate New Score
  IF v_is_home THEN
    v_home_score := v_home_score + 1;
  ELSE
    v_away_score := v_away_score + 1;
  END IF;

  -- 5. Sequence number
  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_sequence
  FROM score_events WHERE match_id = p_match_id;

  -- 6. Insert Point Event (Throws unique_violation if idempotency key race condition occurs)
  INSERT INTO score_events (match_id, match_set_id, sequence_number, event_type, team_id, home_score_after, away_score_after, idempotency_key, created_by)
  VALUES (p_match_id, v_set_id, v_sequence, 'POINT', p_team_id, v_home_score, v_away_score, p_idempotency_key, auth.uid());

  -- 7. Update Set Score
  UPDATE match_sets
  SET home_score = v_home_score, away_score = v_away_score
  WHERE id = v_set_id;

  -- 8. Check Set Completion
  IF (v_is_home AND v_home_score >= v_target_points AND (NOT v_win_by_two OR (v_home_score - v_away_score) >= 2)) THEN
    v_set_winner := v_home_team_id;
  ELSIF (NOT v_is_home AND v_away_score >= v_target_points AND (NOT v_win_by_two OR (v_away_score - v_home_score) >= 2)) THEN
    v_set_winner := v_away_team_id;
  END IF;

  IF v_set_winner IS NOT NULL THEN
    UPDATE match_sets
    SET status = 'COMPLETED', winner_team_id = v_set_winner, completed_at = now()
    WHERE id = v_set_id;

    -- Evaluate Match Completion (Simplified check)
    DECLARE
      v_home_sets_won integer;
      v_away_sets_won integer;
    BEGIN
      SELECT COUNT(*) INTO v_home_sets_won FROM match_sets WHERE match_id = p_match_id AND winner_team_id = v_home_team_id;
      SELECT COUNT(*) INTO v_away_sets_won FROM match_sets WHERE match_id = p_match_id AND winner_team_id = v_away_team_id;

      IF v_home_sets_won >= v_sets_to_win THEN
        UPDATE matches SET status = 'COMPLETED', winner_team_id = v_home_team_id, updated_at = now() WHERE id = p_match_id;
      ELSIF v_away_sets_won >= v_sets_to_win THEN
        UPDATE matches SET status = 'COMPLETED', winner_team_id = v_away_team_id, updated_at = now() WHERE id = p_match_id;
      END IF;
    END;
  END IF;

  RETURN jsonb_build_object('home_score', v_home_score, 'away_score', v_away_score, 'set_winner', v_set_winner);

EXCEPTION
  WHEN unique_violation THEN
    DECLARE
      v_constraint_name text;
    BEGIN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name = 'score_events_match_id_idempotency_key_key' THEN
        -- Safely return current score state idempotently due to true concurrent duplicate
        SELECT jsonb_build_object('home_score', home_score, 'away_score', away_score, 'set_winner', winner_team_id)
        INTO v_existing_result
        FROM match_sets 
        WHERE match_id = p_match_id AND status IN ('PENDING', 'LIVE', 'COMPLETED')
        ORDER BY set_number DESC LIMIT 1;
        
        RETURN v_existing_result;
      ELSE
        RAISE;
      END IF;
    END;
END;
$$;
