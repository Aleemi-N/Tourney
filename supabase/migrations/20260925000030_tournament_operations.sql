-- V1 tournament operations: scoped organizer access, team naming, fixtures,
-- standings, knockout progression, and tournament lifecycle automation.

--------------------------------------------------------------------------------
-- 1. ORGANIZER AUTHORITY
--------------------------------------------------------------------------------

-- The creator is the protected primary organizer. Legacy/imported tournaments
-- may not have a matching membership row, so management authorization must
-- recognize both sources of authority.
CREATE OR REPLACE FUNCTION public.is_tournament_organizer(tourn_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.tournaments t
    WHERE t.id = tourn_id
      AND (
        t.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.tournament_members tm
          WHERE tm.tournament_id = t.id
            AND tm.user_id = auth.uid()
            AND tm.role = 'ORGANIZER'
            AND tm.status = 'ACTIVE'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_primary_tournament_organizer(tourn_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = tourn_id AND t.created_by = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_primary_tournament_organizer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_primary_tournament_organizer(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_tournament_member(tourn_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = tourn_id
      AND (t.created_by = auth.uid() OR EXISTS (
        SELECT 1 FROM public.tournament_members tm
        WHERE tm.tournament_id=t.id AND tm.user_id=auth.uid() AND tm.status='ACTIVE'
      ))
  );
$$;

--------------------------------------------------------------------------------
-- 2. TEAM RENAME (UPDATE-IN-PLACE + AUDIT)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rename_tournament_team(p_team_id uuid, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_team public.teams%ROWTYPE;
  v_name text := btrim(p_name);
  v_organization_id uuid;
BEGIN
  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id FOR UPDATE;
  IF v_team.id IS NULL OR NOT public.is_tournament_organizer(v_team.tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF v_name IS NULL OR v_name = '' OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'Team name must contain 1 to 120 characters';
  END IF;
  IF v_name = v_team.name THEN
    RETURN jsonb_build_object('team_id', v_team.id, 'name', v_team.name, 'renamed', false);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.teams
    WHERE tournament_id = v_team.tournament_id AND id <> v_team.id AND lower(name) = lower(v_name)
  ) THEN
    RAISE EXCEPTION 'A team with this name already exists';
  END IF;

  UPDATE public.teams SET name = v_name, updated_at = now() WHERE id = v_team.id;
  SELECT organization_id INTO v_organization_id FROM public.tournaments WHERE id = v_team.tournament_id;
  INSERT INTO public.audit_logs (
    organization_id, tournament_id, user_id, action, entity_type, entity_id,
    before_json, after_json, reason
  ) VALUES (
    v_organization_id, v_team.tournament_id, auth.uid(), 'TEAM_RENAMED', 'TEAM', v_team.id,
    jsonb_build_object('name', v_team.name), jsonb_build_object('name', v_name),
    'Team renamed by tournament organizer'
  );
  RETURN jsonb_build_object('team_id', v_team.id, 'name', v_name, 'renamed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rename_tournament_team(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_tournament_team(uuid, text) TO authenticated;

-- Force name changes through the audited RPC while preserving the existing
-- owner-editable presentation fields and every team relationship.
REVOKE UPDATE ON public.teams FROM authenticated;
GRANT UPDATE (short_name,logo_path,place,primary_color,secondary_color) ON public.teams TO authenticated;

--------------------------------------------------------------------------------
-- 3. FIXTURE STRUCTURE + TRUSTED EDITS
--------------------------------------------------------------------------------

ALTER TABLE public.matches
  ADD COLUMN round_number integer CHECK (round_number IS NULL OR round_number > 0),
  ADD COLUMN bracket_position integer CHECK (bracket_position IS NULL OR bracket_position > 0);

ALTER TABLE public.matches ALTER COLUMN home_team_id DROP NOT NULL;
ALTER TABLE public.matches ALTER COLUMN away_team_id DROP NOT NULL;
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_check;
ALTER TABLE public.matches ADD CONSTRAINT matches_distinct_teams
  CHECK (home_team_id IS NULL OR away_team_id IS NULL OR home_team_id <> away_team_id);
CREATE UNIQUE INDEX matches_stage_round_position_unique
  ON public.matches(stage_id, round_number, bracket_position)
  WHERE round_number IS NOT NULL AND bracket_position IS NOT NULL;

CREATE OR REPLACE FUNCTION public.initialize_match_sets(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_match public.matches%ROWTYPE; v_rule_id uuid; v_set record;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF v_match.id IS NULL THEN RAISE EXCEPTION 'Match not found'; END IF;
  SELECT id INTO v_rule_id FROM public.volleyball_rules
  WHERE tournament_id = v_match.tournament_id AND (stage_id = v_match.stage_id OR stage_id IS NULL)
  ORDER BY stage_id NULLS LAST LIMIT 1;
  IF v_rule_id IS NULL THEN RAISE EXCEPTION 'Volleyball rules are required before fixture generation'; END IF;
  FOR v_set IN SELECT set_number, target_points FROM public.volleyball_set_rules WHERE volleyball_rule_id = v_rule_id ORDER BY set_number LOOP
    INSERT INTO public.match_sets(match_id, set_number, target_points)
    VALUES (p_match_id, v_set.set_number, v_set.target_points) ON CONFLICT DO NOTHING;
  END LOOP;
  IF NOT FOUND THEN
    INSERT INTO public.match_sets(match_id, set_number, target_points)
    VALUES (p_match_id, 1, 25), (p_match_id, 2, 25), (p_match_id, 3, 15)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.initialize_match_sets(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_match_schedule(
  p_match_id uuid,
  p_scheduled_at timestamptz,
  p_venue text DEFAULT NULL,
  p_court text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_match public.matches%ROWTYPE; v_status text; v_before jsonb; v_org uuid;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF v_match.id IS NULL OR NOT public.is_tournament_organizer(v_match.tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v_match.status IN ('LIVE','COMPLETED','CANCELLED') THEN RAISE EXCEPTION 'Only scheduled or postponed matches can be rescheduled'; END IF;
  v_status := COALESCE(p_status, CASE WHEN p_scheduled_at IS NULL THEN v_match.status ELSE 'SCHEDULED' END);
  IF v_status NOT IN ('SCHEDULED','POSTPONED') THEN RAISE EXCEPTION 'Invalid schedule status'; END IF;
  IF p_venue IS NOT NULL AND char_length(btrim(p_venue)) > 200 THEN RAISE EXCEPTION 'Venue is too long'; END IF;
  IF p_court IS NOT NULL AND char_length(btrim(p_court)) > 80 THEN RAISE EXCEPTION 'Court is too long'; END IF;
  v_before := jsonb_build_object('scheduled_at',v_match.scheduled_at,'venue',v_match.venue,'court',v_match.court,'status',v_match.status);
  UPDATE public.matches SET scheduled_at=p_scheduled_at, venue=nullif(btrim(p_venue),''), court=nullif(btrim(p_court),''), status=v_status, updated_at=now() WHERE id=p_match_id;
  SELECT organization_id INTO v_org FROM public.tournaments WHERE id=v_match.tournament_id;
  INSERT INTO public.audit_logs(organization_id,tournament_id,user_id,action,entity_type,entity_id,before_json,after_json,reason)
  VALUES(v_org,v_match.tournament_id,auth.uid(),'MATCH_RESCHEDULED','MATCH',p_match_id,v_before,
    jsonb_build_object('scheduled_at',p_scheduled_at,'venue',nullif(btrim(p_venue),''),'court',nullif(btrim(p_court),''),'status',v_status),'Fixture schedule updated');
  RETURN jsonb_build_object('match_id',p_match_id,'updated',true);
END;
$$;

REVOKE ALL ON FUNCTION public.update_match_schedule(uuid,timestamptz,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_match_schedule(uuid,timestamptz,text,text,text) TO authenticated;

--------------------------------------------------------------------------------
-- 4. LEAGUE + KNOCKOUT GENERATION
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_stage_fixtures(p_stage_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_stage public.tournament_stages%ROWTYPE; v_created integer:=0; v_existing integer;
  v_match_id uuid; v_home record; v_away record; v_team_count integer;
  v_bracket_size integer:=1; v_rounds integer:=0; v_round integer; v_position integer;
  v_matches_this_round integer; v_teams uuid[];
  v_home_seed integer; v_away_seed integer; v_previous_stage uuid; v_qualification_count integer;
BEGIN
  SELECT * INTO v_stage FROM public.tournament_stages WHERE id=p_stage_id FOR UPDATE;
  IF v_stage.id IS NULL OR NOT public.is_tournament_organizer(v_stage.tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.volleyball_rules WHERE tournament_id=v_stage.tournament_id AND (stage_id=p_stage_id OR stage_id IS NULL)) THEN
    RAISE EXCEPTION 'Volleyball rules are required before fixture generation';
  END IF;
  SELECT count(*) INTO v_existing FROM public.matches WHERE stage_id=p_stage_id;
  IF v_existing > 0 THEN RETURN jsonb_build_object('stage_id',p_stage_id,'created',0,'existing',v_existing,'idempotent',true); END IF;

  IF v_stage.stage_type='LEAGUE' THEN
    FOR v_home IN SELECT id FROM public.teams WHERE tournament_id=v_stage.tournament_id AND status='ACTIVE' ORDER BY id LOOP
      FOR v_away IN SELECT id FROM public.teams WHERE tournament_id=v_stage.tournament_id AND status='ACTIVE' AND id>v_home.id ORDER BY id LOOP
        INSERT INTO public.matches(tournament_id,stage_id,match_number,round_number,home_team_id,away_team_id,status)
        VALUES(v_stage.tournament_id,p_stage_id,v_created+1,1,v_home.id,v_away.id,'SCHEDULED') RETURNING id INTO v_match_id;
        PERFORM public.initialize_match_sets(v_match_id); v_created:=v_created+1;
      END LOOP;
    END LOOP;
  ELSE
    SELECT id,qualification_count INTO v_previous_stage,v_qualification_count
    FROM public.tournament_stages WHERE tournament_id=v_stage.tournament_id AND sequence<v_stage.sequence
    ORDER BY sequence DESC LIMIT 1;
    IF v_previous_stage IS NOT NULL AND v_qualification_count IS NOT NULL THEN
      SELECT array_agg((entry.value->>'team_id')::uuid ORDER BY entry.ordinality),count(*)
      INTO v_teams,v_team_count
      FROM jsonb_array_elements(public.get_stage_standings(v_previous_stage)) WITH ORDINALITY entry(value,ordinality)
      WHERE entry.ordinality<=v_qualification_count;
    ELSE
      SELECT array_agg(id ORDER BY id),count(*) INTO v_teams,v_team_count FROM public.teams WHERE tournament_id=v_stage.tournament_id AND status='ACTIVE';
    END IF;
    IF v_team_count < 2 THEN RAISE EXCEPTION 'At least two active teams are required'; END IF;
    WHILE v_bracket_size<v_team_count LOOP v_bracket_size:=v_bracket_size*2; v_rounds:=v_rounds+1; END LOOP;
    FOR v_round IN 1..v_rounds LOOP
      v_matches_this_round:=v_bracket_size/(2^v_round)::integer;
      FOR v_position IN 1..v_matches_this_round LOOP
        v_home_seed:=CASE WHEN v_round=1 THEN v_position ELSE NULL END;
        v_away_seed:=CASE WHEN v_round=1 THEN v_bracket_size-v_position+1 ELSE NULL END;
        INSERT INTO public.matches(tournament_id,stage_id,match_number,round_number,bracket_position,home_team_id,away_team_id,status)
        VALUES(v_stage.tournament_id,p_stage_id,v_created+1,v_round,v_position,
          CASE WHEN v_home_seed<=v_team_count THEN v_teams[v_home_seed] ELSE NULL END,
          CASE WHEN v_away_seed<=v_team_count THEN v_teams[v_away_seed] ELSE NULL END,'SCHEDULED') RETURNING id INTO v_match_id;
        v_created:=v_created+1;
      END LOOP;
    END LOOP;
    FOR v_round IN 1..v_rounds-1 LOOP
      v_matches_this_round:=v_bracket_size/(2^v_round)::integer;
      FOR v_position IN 1..v_matches_this_round LOOP
        UPDATE public.matches source_match SET
          next_match_id=(SELECT target_match.id FROM public.matches target_match WHERE target_match.stage_id=p_stage_id AND target_match.round_number=v_round+1 AND target_match.bracket_position=((v_position+1)/2)::integer),
          next_match_slot=CASE WHEN v_position%2=1 THEN 'HOME' ELSE 'AWAY' END
        WHERE source_match.stage_id=p_stage_id AND source_match.round_number=v_round AND source_match.bracket_position=v_position;
      END LOOP;
    END LOOP;
    -- Resolve first-round byes into the next round immediately.
    FOR v_match_id IN SELECT id FROM public.matches WHERE stage_id=p_stage_id AND round_number=1 AND ((home_team_id IS NULL)<>(away_team_id IS NULL)) LOOP
      UPDATE public.matches SET status='COMPLETED',winner_team_id=COALESCE(home_team_id,away_team_id),updated_at=now() WHERE id=v_match_id;
    END LOOP;
    FOR v_match_id IN SELECT id FROM public.matches WHERE stage_id=p_stage_id AND home_team_id IS NOT NULL AND away_team_id IS NOT NULL LOOP
      PERFORM public.initialize_match_sets(v_match_id);
    END LOOP;
  END IF;
  UPDATE public.tournament_stages SET status='ACTIVE' WHERE id=p_stage_id AND status='PENDING';
  UPDATE public.tournaments SET status=CASE WHEN status IN ('DRAFT','REGISTRATION','PREPARATION') THEN 'LIVE' ELSE status END,updated_at=now() WHERE id=v_stage.tournament_id;
  RETURN jsonb_build_object('stage_id',p_stage_id,'created',v_created,'existing',0,'idempotent',false,'stage_type',v_stage.stage_type);
END;
$$;

--------------------------------------------------------------------------------
-- 5. RESULTS, STANDINGS, AND PROGRESSION
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.progress_completed_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_next public.matches%ROWTYPE; v_stage_type text; v_next_stage uuid; v_qualified uuid; v_target uuid; v_count integer;
BEGIN
  IF NEW.status<>'COMPLETED' OR NEW.winner_team_id IS NULL OR (OLD.status='COMPLETED' AND OLD.winner_team_id=NEW.winner_team_id) THEN RETURN NEW; END IF;
  SELECT stage_type INTO v_stage_type FROM public.tournament_stages WHERE id=NEW.stage_id;
  IF v_stage_type='KNOCKOUT' AND NEW.next_match_id IS NOT NULL THEN
    SELECT * INTO v_next FROM public.matches WHERE id=NEW.next_match_id FOR UPDATE;
    IF NEW.next_match_slot='HOME' THEN
      IF v_next.home_team_id IS NOT NULL AND v_next.home_team_id<>NEW.winner_team_id THEN RAISE EXCEPTION 'Knockout home slot is already occupied'; END IF;
      UPDATE public.matches SET home_team_id=NEW.winner_team_id,updated_at=now() WHERE id=v_next.id;
    ELSE
      IF v_next.away_team_id IS NOT NULL AND v_next.away_team_id<>NEW.winner_team_id THEN RAISE EXCEPTION 'Knockout away slot is already occupied'; END IF;
      UPDATE public.matches SET away_team_id=NEW.winner_team_id,updated_at=now() WHERE id=v_next.id;
    END IF;
    IF (SELECT home_team_id IS NOT NULL AND away_team_id IS NOT NULL FROM public.matches WHERE id=v_next.id) THEN PERFORM public.initialize_match_sets(v_next.id); END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.matches WHERE stage_id=NEW.stage_id AND status<>'COMPLETED') THEN
    UPDATE public.tournament_stages SET status='COMPLETED' WHERE id=NEW.stage_id;
    SELECT id INTO v_next_stage FROM public.tournament_stages WHERE tournament_id=NEW.tournament_id AND sequence>(SELECT sequence FROM public.tournament_stages WHERE id=NEW.stage_id) ORDER BY sequence LIMIT 1;
    IF v_next_stage IS NULL THEN
      UPDATE public.tournaments SET status='COMPLETED',updated_at=now() WHERE id=NEW.tournament_id;
    ELSE
      UPDATE public.tournament_stages SET status='ACTIVE' WHERE id=v_next_stage AND status='PENDING';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS progress_completed_match_after_result ON public.matches;
CREATE TRIGGER progress_completed_match_after_result
AFTER UPDATE OF status,winner_team_id ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.progress_completed_match();

-- Standings are league-only and are recalculated from authoritative completed matches.
CREATE OR REPLACE FUNCTION public.refresh_stage_standings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_team_id uuid; v_win_points integer:=2; v_loss_points integer:=0;
BEGIN
  IF NEW.stage_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.tournament_stages WHERE id=NEW.stage_id AND stage_type='LEAGUE') THEN RETURN NEW; END IF;
  SELECT COALESCE(win_points,2),COALESCE(loss_points,0) INTO v_win_points,v_loss_points FROM public.standings_rules WHERE stage_id=NEW.stage_id;
  FOR v_team_id IN SELECT id FROM public.teams WHERE tournament_id=NEW.tournament_id AND status='ACTIVE' LOOP
    INSERT INTO public.standings(tournament_id,stage_id,team_id,played,won,lost,league_points,sets_won,sets_lost,points_for,points_against)
    SELECT NEW.tournament_id,NEW.stage_id,v_team_id,
      count(m.id) FILTER(WHERE m.status='COMPLETED'),count(m.id) FILTER(WHERE m.status='COMPLETED' AND m.winner_team_id=v_team_id),
      count(m.id) FILTER(WHERE m.status='COMPLETED' AND m.winner_team_id<>v_team_id),
      count(m.id) FILTER(WHERE m.status='COMPLETED' AND m.winner_team_id=v_team_id)*v_win_points+count(m.id) FILTER(WHERE m.status='COMPLETED' AND m.winner_team_id<>v_team_id)*v_loss_points,
      COALESCE(sum(CASE WHEN m.home_team_id=v_team_id THEN x.home_sets ELSE x.away_sets END),0),COALESCE(sum(CASE WHEN m.home_team_id=v_team_id THEN x.away_sets ELSE x.home_sets END),0),
      COALESCE(sum(CASE WHEN m.home_team_id=v_team_id THEN x.home_points ELSE x.away_points END),0),COALESCE(sum(CASE WHEN m.home_team_id=v_team_id THEN x.away_points ELSE x.home_points END),0)
    FROM public.matches m LEFT JOIN LATERAL(SELECT count(*) FILTER(WHERE winner_team_id=m.home_team_id) home_sets,count(*) FILTER(WHERE winner_team_id=m.away_team_id) away_sets,COALESCE(sum(home_score),0) home_points,COALESCE(sum(away_score),0) away_points FROM public.match_sets WHERE match_id=m.id)x ON true
    WHERE m.stage_id=NEW.stage_id AND (m.home_team_id=v_team_id OR m.away_team_id=v_team_id)
    ON CONFLICT(stage_id,team_id) DO UPDATE SET played=EXCLUDED.played,won=EXCLUDED.won,lost=EXCLUDED.lost,league_points=EXCLUDED.league_points,sets_won=EXCLUDED.sets_won,sets_lost=EXCLUDED.sets_lost,points_for=EXCLUDED.points_for,points_against=EXCLUDED.points_against,updated_at=now();
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_standings_rules(p_stage_id uuid,p_win_points integer,p_loss_points integer,p_tie_break_rules jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tournament uuid; v_rule text;
BEGIN
  SELECT tournament_id INTO v_tournament FROM public.tournament_stages WHERE id=p_stage_id AND stage_type='LEAGUE';
  IF v_tournament IS NULL OR NOT public.is_tournament_organizer(v_tournament) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_win_points<0 OR p_loss_points<0 OR p_win_points<p_loss_points THEN RAISE EXCEPTION 'Invalid standings points'; END IF;
  IF jsonb_typeof(p_tie_break_rules)<>'array' OR jsonb_array_length(p_tie_break_rules)=0 THEN RAISE EXCEPTION 'At least one tie-break rule is required'; END IF;
  FOR v_rule IN SELECT jsonb_array_elements_text(p_tie_break_rules) LOOP
    IF v_rule NOT IN ('WINS','SET_DIFFERENCE','SET_RATIO','POINT_DIFFERENCE','POINT_RATIO','NAME') THEN RAISE EXCEPTION 'Unsupported tie-break rule: %',v_rule; END IF;
  END LOOP;
  INSERT INTO public.standings_rules(stage_id,win_points,loss_points,tie_break_rules,updated_at) VALUES(p_stage_id,p_win_points,p_loss_points,p_tie_break_rules,now())
  ON CONFLICT(stage_id) DO UPDATE SET win_points=EXCLUDED.win_points,loss_points=EXCLUDED.loss_points,tie_break_rules=EXCLUDED.tie_break_rules,updated_at=now();
  RETURN jsonb_build_object('stage_id',p_stage_id,'saved',true);
END; $$;

CREATE OR REPLACE FUNCTION public.get_stage_standings(p_stage_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tournament uuid; v_public boolean; v_rules jsonb; v_result jsonb; v_order text:='s.league_points DESC'; v_rule text;
BEGIN
  SELECT ts.tournament_id,t.is_public INTO v_tournament,v_public FROM public.tournament_stages ts JOIN public.tournaments t ON t.id=ts.tournament_id WHERE ts.id=p_stage_id;
  IF v_tournament IS NULL OR NOT (v_public OR public.is_tournament_member(v_tournament) OR public.is_tournament_organizer(v_tournament)) THEN RAISE EXCEPTION 'Stage not available'; END IF;
  SELECT COALESCE(tie_break_rules,'["WINS","SET_DIFFERENCE","POINT_DIFFERENCE","NAME"]'::jsonb) INTO v_rules FROM public.standings_rules WHERE stage_id=p_stage_id;
  IF v_rules IS NULL THEN v_rules:='["WINS","SET_DIFFERENCE","POINT_DIFFERENCE","NAME"]'::jsonb; END IF;
  FOR v_rule IN SELECT jsonb_array_elements_text(v_rules) LOOP
    v_order:=v_order||CASE v_rule WHEN 'WINS' THEN ',s.won DESC' WHEN 'SET_DIFFERENCE' THEN ',(s.sets_won-s.sets_lost) DESC' WHEN 'SET_RATIO' THEN ',CASE WHEN s.sets_lost=0 THEN s.sets_won::numeric ELSE s.sets_won::numeric/s.sets_lost END DESC' WHEN 'POINT_DIFFERENCE' THEN ',(s.points_for-s.points_against) DESC' WHEN 'POINT_RATIO' THEN ',CASE WHEN s.points_against=0 THEN s.points_for::numeric ELSE s.points_for::numeric/s.points_against END DESC' WHEN 'NAME' THEN ',t.name ASC' ELSE '' END;
  END LOOP;
  EXECUTE 'SELECT COALESCE(jsonb_agg(row_data ORDER BY rank),''[]''::jsonb) FROM (SELECT row_number() OVER(ORDER BY '||v_order||') rank,jsonb_build_object(''rank'',row_number() OVER(ORDER BY '||v_order||'),''team_id'',s.team_id,''team_name'',t.name,''played'',s.played,''won'',s.won,''lost'',s.lost,''league_points'',s.league_points,''sets_won'',s.sets_won,''sets_lost'',s.sets_lost,''points_for'',s.points_for,''points_against'',s.points_against) row_data FROM public.standings s JOIN public.teams t ON t.id=s.team_id WHERE s.stage_id=$1) ranked' INTO v_result USING p_stage_id;
  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION public.save_standings_rules(uuid,integer,integer,jsonb),public.get_stage_standings(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_standings_rules(uuid,integer,integer,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stage_standings(uuid) TO anon,authenticated;

-- Authoritative operational tables are mutated only by trusted functions.
DROP POLICY IF EXISTS "Organizers can manage matches" ON public.matches;
DROP POLICY IF EXISTS "Organizers can manage scorers" ON public.match_scorers;
REVOKE INSERT,UPDATE,DELETE ON public.matches,public.match_scorers,public.standings,public.standings_rules FROM authenticated;

REVOKE ALL ON FUNCTION public.generate_stage_fixtures(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.generate_stage_fixtures(uuid) TO authenticated;
