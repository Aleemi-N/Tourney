-- M32: authoritative fixture ordering, explicit league progression plans,
-- winner/loser bracket routing, and safe public fixture structure.

--------------------------------------------------------------------------------
-- 1. AUTHORITATIVE PROGRAM ORDER
--------------------------------------------------------------------------------

ALTER TABLE public.matches ADD COLUMN program_order integer;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY tournament_id, stage_id, round_number
    ORDER BY match_number NULLS LAST, scheduled_at NULLS LAST, created_at, id
  )::integer AS position
  FROM public.matches
)
UPDATE public.matches m SET program_order = ranked.position
FROM ranked WHERE ranked.id = m.id;

ALTER TABLE public.matches ALTER COLUMN program_order SET NOT NULL;
ALTER TABLE public.matches ADD CONSTRAINT matches_program_order_positive CHECK (program_order > 0);

CREATE UNIQUE INDEX matches_program_order_scope_unique
  ON public.matches(tournament_id, stage_id, round_number, program_order) NULLS NOT DISTINCT;
CREATE INDEX matches_program_order_read_idx
  ON public.matches(tournament_id, stage_id, round_number, program_order);

CREATE TABLE public.match_order_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.tournament_stages(id) ON DELETE CASCADE,
  round_number integer CHECK (round_number IS NULL OR round_number > 0),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT match_order_scopes_context_unique
    UNIQUE NULLS NOT DISTINCT (tournament_id, stage_id, round_number)
);

INSERT INTO public.match_order_scopes(tournament_id, stage_id, round_number)
SELECT DISTINCT tournament_id, stage_id, round_number FROM public.matches;

ALTER TABLE public.match_order_scopes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Organizers can read match order scopes" ON public.match_order_scopes
  FOR SELECT USING (public.is_tournament_organizer(tournament_id));
REVOKE INSERT, UPDATE, DELETE ON public.match_order_scopes FROM authenticated;

CREATE OR REPLACE FUNCTION public.assign_match_program_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_scope public.match_order_scopes%ROWTYPE;
BEGIN
  INSERT INTO public.match_order_scopes(tournament_id, stage_id, round_number)
  VALUES(NEW.tournament_id, NEW.stage_id, NEW.round_number)
  ON CONFLICT ON CONSTRAINT match_order_scopes_context_unique DO NOTHING;

  SELECT * INTO v_scope FROM public.match_order_scopes
  WHERE tournament_id=NEW.tournament_id
    AND stage_id IS NOT DISTINCT FROM NEW.stage_id
    AND round_number IS NOT DISTINCT FROM NEW.round_number
  FOR UPDATE;

  IF NEW.program_order IS NULL THEN
    SELECT COALESCE(max(program_order),0)+1 INTO NEW.program_order
    FROM public.matches
    WHERE tournament_id=NEW.tournament_id
      AND stage_id IS NOT DISTINCT FROM NEW.stage_id
      AND round_number IS NOT DISTINCT FROM NEW.round_number;
  END IF;
  IF NEW.program_order <= 0 THEN RAISE EXCEPTION 'Program order must be positive'; END IF;

  UPDATE public.match_order_scopes
  SET revision=revision+1,updated_at=now(),updated_by=auth.uid()
  WHERE id=v_scope.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assign_match_program_order_before_insert
BEFORE INSERT ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.assign_match_program_order();
REVOKE ALL ON FUNCTION public.assign_match_program_order() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reorder_matches(
  p_tournament_id uuid,
  p_stage_id uuid,
  p_round_number integer,
  p_ordered_match_ids uuid[],
  p_expected_revision bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_scope public.match_order_scopes%ROWTYPE; v_count integer; v_distinct integer;
  v_before jsonb; v_after jsonb; v_org uuid; v_offset integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_ordered_match_ids IS NULL OR cardinality(p_ordered_match_ids)=0 THEN RAISE EXCEPTION 'A complete match order is required'; END IF;
  IF p_round_number IS NOT NULL AND p_round_number<=0 THEN RAISE EXCEPTION 'Invalid round'; END IF;
  IF p_stage_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tournament_stages WHERE id=p_stage_id AND tournament_id=p_tournament_id) THEN RAISE EXCEPTION 'Stage does not belong to tournament'; END IF;

  SELECT * INTO v_scope FROM public.match_order_scopes
  WHERE tournament_id=p_tournament_id AND stage_id IS NOT DISTINCT FROM p_stage_id AND round_number IS NOT DISTINCT FROM p_round_number
  FOR UPDATE;
  IF v_scope.id IS NULL THEN RAISE EXCEPTION 'Match order scope not found'; END IF;
  IF p_expected_revision IS NULL OR p_expected_revision<>v_scope.revision THEN RAISE EXCEPTION 'Stale match order revision'; END IF;

  PERFORM 1 FROM public.matches
  WHERE tournament_id=p_tournament_id AND stage_id IS NOT DISTINCT FROM p_stage_id AND round_number IS NOT DISTINCT FROM p_round_number
  ORDER BY id FOR UPDATE;
  SELECT count(*) INTO v_count FROM public.matches
  WHERE tournament_id=p_tournament_id AND stage_id IS NOT DISTINCT FROM p_stage_id AND round_number IS NOT DISTINCT FROM p_round_number;
  SELECT count(DISTINCT id) INTO v_distinct FROM unnest(p_ordered_match_ids) id;
  IF cardinality(p_ordered_match_ids)<>v_count OR v_distinct<>v_count THEN RAISE EXCEPTION 'Match order must be a complete duplicate-free permutation'; END IF;
  IF EXISTS(
    SELECT 1 FROM unnest(p_ordered_match_ids) id
    WHERE NOT EXISTS(SELECT 1 FROM public.matches m WHERE m.id=id AND m.tournament_id=p_tournament_id AND m.stage_id IS NOT DISTINCT FROM p_stage_id AND m.round_number IS NOT DISTINCT FROM p_round_number)
  ) THEN RAISE EXCEPTION 'Match order contains a foreign match'; END IF;
  IF EXISTS(
    SELECT 1 FROM unnest(p_ordered_match_ids) WITH ORDINALITY requested(id,position)
    JOIN public.matches m ON m.id=requested.id
    WHERE m.status IN ('LIVE','COMPLETED') AND m.program_order<>requested.position
  ) THEN RAISE EXCEPTION 'LIVE and COMPLETED matches cannot be moved'; END IF;

  SELECT jsonb_agg(jsonb_build_object('match_id',id,'program_order',program_order) ORDER BY program_order)
  INTO v_before FROM public.matches
  WHERE tournament_id=p_tournament_id AND stage_id IS NOT DISTINCT FROM p_stage_id AND round_number IS NOT DISTINCT FROM p_round_number;
  SELECT COALESCE(max(program_order),0)+v_count+1 INTO v_offset FROM public.matches
  WHERE tournament_id=p_tournament_id AND stage_id IS NOT DISTINCT FROM p_stage_id AND round_number IS NOT DISTINCT FROM p_round_number;

  UPDATE public.matches SET program_order=program_order+v_offset
  WHERE tournament_id=p_tournament_id AND stage_id IS NOT DISTINCT FROM p_stage_id AND round_number IS NOT DISTINCT FROM p_round_number;
  UPDATE public.matches m SET program_order=requested.position
  FROM unnest(p_ordered_match_ids) WITH ORDINALITY requested(id,position)
  WHERE m.id=requested.id;

  UPDATE public.match_order_scopes SET revision=revision+1,updated_at=now(),updated_by=auth.uid() WHERE id=v_scope.id
  RETURNING revision INTO v_scope.revision;
  SELECT jsonb_agg(jsonb_build_object('match_id',id,'program_order',program_order) ORDER BY program_order)
  INTO v_after FROM public.matches
  WHERE tournament_id=p_tournament_id AND stage_id IS NOT DISTINCT FROM p_stage_id AND round_number IS NOT DISTINCT FROM p_round_number;
  SELECT organization_id INTO v_org FROM public.tournaments WHERE id=p_tournament_id;
  INSERT INTO public.audit_logs(organization_id,tournament_id,user_id,action,entity_type,entity_id,before_json,after_json,reason)
  VALUES(v_org,p_tournament_id,auth.uid(),'MATCH_ORDER_REORDERED',CASE WHEN p_stage_id IS NULL THEN 'TOURNAMENT' ELSE 'TOURNAMENT_STAGE' END,COALESCE(p_stage_id,p_tournament_id),
    jsonb_build_object('stage_id',p_stage_id,'round_number',p_round_number,'revision',p_expected_revision,'matches',v_before),
    jsonb_build_object('stage_id',p_stage_id,'round_number',p_round_number,'revision',v_scope.revision,'matches',v_after),'Fixture program order changed');
  RETURN jsonb_build_object('tournament_id',p_tournament_id,'stage_id',p_stage_id,'round_number',p_round_number,'revision',v_scope.revision,'matches',v_after);
END;
$$;
REVOKE ALL ON FUNCTION public.reorder_matches(uuid,uuid,integer,uuid[],bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_matches(uuid,uuid,integer,uuid[],bigint) TO authenticated;

--------------------------------------------------------------------------------
-- 2. EXPLICIT LEAGUE PROGRESSION + BRACKET ROUTING
--------------------------------------------------------------------------------

ALTER TABLE public.matches
  ADD COLUMN bracket_match_type text NOT NULL DEFAULT 'STANDARD'
    CHECK (bracket_match_type IN ('STANDARD','SEMIFINAL','FINAL','THIRD_PLACE')),
  ADD COLUMN loser_next_match_id uuid REFERENCES public.matches(id),
  ADD COLUMN loser_next_match_slot text CHECK (loser_next_match_slot IN ('HOME','AWAY')),
  ADD CONSTRAINT matches_winner_route_paired CHECK ((next_match_id IS NULL)=(next_match_slot IS NULL)) NOT VALID,
  ADD CONSTRAINT matches_loser_route_paired CHECK ((loser_next_match_id IS NULL)=(loser_next_match_slot IS NULL)),
  ADD CONSTRAINT matches_distinct_routes CHECK (loser_next_match_id IS NULL OR loser_next_match_id IS DISTINCT FROM next_match_id);

CREATE TABLE public.tournament_progression_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  source_stage_id uuid NOT NULL REFERENCES public.tournament_stages(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('FINISH_AFTER_LEAGUE','TOP_2_FINAL','TOP_4_SEMIFINALS')),
  include_third_place boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'APPLIED' CHECK (status='APPLIED'),
  idempotency_key text NOT NULL CHECK (btrim(idempotency_key)<>''),
  target_stage_id uuid REFERENCES public.tournament_stages(id) ON DELETE RESTRICT,
  standings_revision jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_stage_id),
  UNIQUE(tournament_id,idempotency_key)
);

CREATE TABLE public.progression_plan_seeds (
  plan_id uuid NOT NULL REFERENCES public.tournament_progression_plans(id) ON DELETE CASCADE,
  seed integer NOT NULL CHECK (seed BETWEEN 1 AND 4),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE RESTRICT,
  PRIMARY KEY(plan_id,seed),
  UNIQUE(plan_id,team_id)
);

ALTER TABLE public.tournament_progression_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progression_plan_seeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Organizers can read progression plans" ON public.tournament_progression_plans FOR SELECT USING (public.is_tournament_organizer(tournament_id));
CREATE POLICY "Organizers can read progression seeds" ON public.progression_plan_seeds FOR SELECT USING (
  EXISTS(SELECT 1 FROM public.tournament_progression_plans p WHERE p.id=plan_id AND public.is_tournament_organizer(p.tournament_id))
);
REVOKE INSERT,UPDATE,DELETE ON public.tournament_progression_plans,public.progression_plan_seeds FROM authenticated;

-- Make otherwise equal standings deterministic for bracket seeding.
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
  v_order:=v_order||',s.team_id ASC';
  EXECUTE 'SELECT COALESCE(jsonb_agg(row_data ORDER BY rank),''[]''::jsonb) FROM (SELECT row_number() OVER(ORDER BY '||v_order||') rank,jsonb_build_object(''rank'',row_number() OVER(ORDER BY '||v_order||'),''team_id'',s.team_id,''team_name'',t.name,''played'',s.played,''won'',s.won,''lost'',s.lost,''league_points'',s.league_points,''sets_won'',s.sets_won,''sets_lost'',s.sets_lost,''points_for'',s.points_for,''points_against'',s.points_against) row_data FROM public.standings s JOIN public.teams t ON t.id=s.team_id WHERE s.stage_id=$1) ranked' INTO v_result USING p_stage_id;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.preview_league_progression(p_stage_id uuid,p_decision text,p_include_third_place boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_stage public.tournament_stages%ROWTYPE; v_standings jsonb; v_needed integer; v_matches jsonb;
BEGIN
  SELECT * INTO v_stage FROM public.tournament_stages WHERE id=p_stage_id;
  IF v_stage.id IS NULL OR NOT public.is_tournament_organizer(v_stage.tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v_stage.stage_type<>'LEAGUE' THEN RAISE EXCEPTION 'Source stage must be LEAGUE'; END IF;
  IF p_decision NOT IN ('FINISH_AFTER_LEAGUE','TOP_2_FINAL','TOP_4_SEMIFINALS') THEN RAISE EXCEPTION 'Invalid progression decision'; END IF;
  IF p_decision='FINISH_AFTER_LEAGUE' AND p_include_third_place THEN RAISE EXCEPTION 'Third place is not valid when finishing after league'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.matches WHERE stage_id=p_stage_id) THEN RAISE EXCEPTION 'League has no matches'; END IF;
  IF EXISTS(SELECT 1 FROM public.matches WHERE stage_id=p_stage_id AND (status<>'COMPLETED' OR winner_team_id IS NULL)) THEN RAISE EXCEPTION 'League is not complete'; END IF;
  SELECT public.get_stage_standings(p_stage_id) INTO v_standings;
  v_needed:=CASE WHEN p_decision='FINISH_AFTER_LEAGUE' THEN 0 WHEN p_decision='TOP_2_FINAL' AND NOT p_include_third_place THEN 2 ELSE 4 END;
  IF jsonb_array_length(v_standings)<v_needed THEN RAISE EXCEPTION 'Not enough ranked teams for this progression'; END IF;
  v_matches:=CASE p_decision
    WHEN 'FINISH_AFTER_LEAGUE' THEN '[]'::jsonb
    WHEN 'TOP_2_FINAL' THEN jsonb_build_array(
      jsonb_build_object('label','FINAL','home',v_standings->0,'away',v_standings->1)
    ) || CASE WHEN p_include_third_place THEN jsonb_build_array(jsonb_build_object('label','THIRD_PLACE','home',v_standings->2,'away',v_standings->3)) ELSE '[]'::jsonb END
    ELSE jsonb_build_array(
      jsonb_build_object('label','SEMIFINAL 1','home',v_standings->0,'away',v_standings->3),
      jsonb_build_object('label','SEMIFINAL 2','home',v_standings->1,'away',v_standings->2),
      jsonb_build_object('label','FINAL','home_source','Winner SF1','away_source','Winner SF2')
    ) || CASE WHEN p_include_third_place THEN jsonb_build_array(jsonb_build_object('label','THIRD_PLACE','home_source','Loser SF1','away_source','Loser SF2')) ELSE '[]'::jsonb END
  END;
  RETURN jsonb_build_object('tournament_id',v_stage.tournament_id,'source_stage_id',p_stage_id,'decision',p_decision,'include_third_place',p_include_third_place,'standings',v_standings,'matches',v_matches);
END; $$;
REVOKE ALL ON FUNCTION public.preview_league_progression(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_league_progression(uuid,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_league_progression(p_stage_id uuid,p_decision text,p_include_third_place boolean,p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_stage public.tournament_stages%ROWTYPE; v_existing public.tournament_progression_plans%ROWTYPE;
  v_preview jsonb; v_standings jsonb; v_plan uuid; v_target uuid; v_sequence integer; v_org uuid;
  v_seed1 uuid; v_seed2 uuid; v_seed3 uuid; v_seed4 uuid; v_sf1 uuid; v_sf2 uuid; v_final uuid; v_third uuid; v_id uuid;
  v_qualification integer; v_result jsonb; v_source_rule uuid; v_target_rule uuid; v_before_tournament_status text;
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key)='' THEN RAISE EXCEPTION 'Idempotency key is required'; END IF;
  SELECT * INTO v_stage FROM public.tournament_stages WHERE id=p_stage_id FOR UPDATE;
  IF v_stage.id IS NULL OR NOT public.is_tournament_organizer(v_stage.tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT status INTO v_before_tournament_status FROM public.tournaments WHERE id=v_stage.tournament_id FOR UPDATE;

  SELECT * INTO v_existing FROM public.tournament_progression_plans WHERE source_stage_id=p_stage_id;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.idempotency_key=p_idempotency_key AND v_existing.decision=p_decision AND v_existing.include_third_place=p_include_third_place THEN
      RETURN jsonb_build_object('plan_id',v_existing.id,'target_stage_id',v_existing.target_stage_id,'decision',v_existing.decision,'idempotent',true);
    END IF;
    RAISE EXCEPTION 'A conflicting progression decision already exists';
  END IF;
  PERFORM 1 FROM public.matches WHERE stage_id=p_stage_id ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.tournament_stages WHERE tournament_id=v_stage.tournament_id AND sequence>v_stage.sequence) THEN RAISE EXCEPTION 'A later stage already exists'; END IF;
  v_preview:=public.preview_league_progression(p_stage_id,p_decision,p_include_third_place);
  v_standings:=v_preview->'standings';
  v_seed1:=(v_standings->0->>'team_id')::uuid; v_seed2:=(v_standings->1->>'team_id')::uuid;
  IF jsonb_array_length(v_standings)>=3 THEN v_seed3:=(v_standings->2->>'team_id')::uuid; END IF;
  IF jsonb_array_length(v_standings)>=4 THEN v_seed4:=(v_standings->3->>'team_id')::uuid; END IF;
  v_qualification:=CASE WHEN p_decision='FINISH_AFTER_LEAGUE' THEN NULL WHEN p_decision='TOP_2_FINAL' AND NOT p_include_third_place THEN 2 ELSE 4 END;
  UPDATE public.tournament_stages SET status='COMPLETED',qualification_count=v_qualification WHERE id=p_stage_id;

  INSERT INTO public.tournament_progression_plans(tournament_id,source_stage_id,decision,include_third_place,idempotency_key,standings_revision,created_by)
  VALUES(v_stage.tournament_id,p_stage_id,p_decision,p_include_third_place,btrim(p_idempotency_key),v_standings,auth.uid()) RETURNING id INTO v_plan;
  FOR v_id IN SELECT (entry.value->>'team_id')::uuid FROM jsonb_array_elements(v_standings) WITH ORDINALITY entry(value,ordinality) WHERE entry.ordinality<=v_qualification LOOP
    INSERT INTO public.progression_plan_seeds(plan_id,seed,team_id)
    SELECT v_plan,entry.ordinality::integer,(entry.value->>'team_id')::uuid FROM jsonb_array_elements(v_standings) WITH ORDINALITY entry(value,ordinality)
    WHERE (entry.value->>'team_id')::uuid=v_id AND entry.ordinality<=v_qualification ON CONFLICT DO NOTHING;
  END LOOP;

  IF p_decision='FINISH_AFTER_LEAGUE' THEN
    UPDATE public.tournaments SET status='COMPLETED',updated_at=now() WHERE id=v_stage.tournament_id;
  ELSE
    v_sequence:=v_stage.sequence+1;
    INSERT INTO public.tournament_stages(tournament_id,name,stage_type,sequence,status)
    VALUES(v_stage.tournament_id,CASE WHEN p_decision='TOP_2_FINAL' THEN 'Final Stage' ELSE 'Championship Knockout' END,'KNOCKOUT',v_sequence,'ACTIVE') RETURNING id INTO v_target;
    UPDATE public.tournament_progression_plans SET target_stage_id=v_target WHERE id=v_plan;
    SELECT id INTO v_source_rule FROM public.volleyball_rules
    WHERE tournament_id=v_stage.tournament_id AND (stage_id=p_stage_id OR stage_id IS NULL)
    ORDER BY stage_id NULLS LAST LIMIT 1;
    IF v_source_rule IS NULL THEN RAISE EXCEPTION 'Volleyball rules are required before progression'; END IF;
    INSERT INTO public.volleyball_rules(tournament_id,stage_id,sets_to_win,win_by_two)
    SELECT tournament_id,v_target,sets_to_win,win_by_two FROM public.volleyball_rules WHERE id=v_source_rule
    RETURNING id INTO v_target_rule;
    INSERT INTO public.volleyball_set_rules(volleyball_rule_id,set_number,target_points)
    SELECT v_target_rule,set_number,target_points FROM public.volleyball_set_rules WHERE volleyball_rule_id=v_source_rule;
    IF p_decision='TOP_2_FINAL' THEN
      INSERT INTO public.matches(tournament_id,stage_id,match_number,round_number,bracket_position,program_order,bracket_match_type,home_team_id,away_team_id,status)
      VALUES(v_stage.tournament_id,v_target,1,1,1,1,'FINAL',v_seed1,v_seed2,'SCHEDULED') RETURNING id INTO v_final;
      PERFORM public.initialize_match_sets(v_final);
      IF p_include_third_place THEN
        INSERT INTO public.matches(tournament_id,stage_id,match_number,round_number,bracket_position,program_order,bracket_match_type,home_team_id,away_team_id,status)
        VALUES(v_stage.tournament_id,v_target,2,1,2,2,'THIRD_PLACE',v_seed3,v_seed4,'SCHEDULED') RETURNING id INTO v_third;
        PERFORM public.initialize_match_sets(v_third);
      END IF;
    ELSE
      INSERT INTO public.matches(tournament_id,stage_id,match_number,round_number,bracket_position,program_order,bracket_match_type,home_team_id,away_team_id,status)
      VALUES(v_stage.tournament_id,v_target,3,2,1,1,'FINAL',NULL,NULL,'SCHEDULED') RETURNING id INTO v_final;
      IF p_include_third_place THEN
        INSERT INTO public.matches(tournament_id,stage_id,match_number,round_number,bracket_position,program_order,bracket_match_type,home_team_id,away_team_id,status)
        VALUES(v_stage.tournament_id,v_target,4,2,2,2,'THIRD_PLACE',NULL,NULL,'SCHEDULED') RETURNING id INTO v_third;
      END IF;
      INSERT INTO public.matches(tournament_id,stage_id,match_number,round_number,bracket_position,program_order,bracket_match_type,home_team_id,away_team_id,status,next_match_id,next_match_slot,loser_next_match_id,loser_next_match_slot)
      VALUES(v_stage.tournament_id,v_target,1,1,1,1,'SEMIFINAL',v_seed1,v_seed4,'SCHEDULED',v_final,'HOME',v_third,CASE WHEN v_third IS NULL THEN NULL ELSE 'HOME' END) RETURNING id INTO v_sf1;
      INSERT INTO public.matches(tournament_id,stage_id,match_number,round_number,bracket_position,program_order,bracket_match_type,home_team_id,away_team_id,status,next_match_id,next_match_slot,loser_next_match_id,loser_next_match_slot)
      VALUES(v_stage.tournament_id,v_target,2,1,2,2,'SEMIFINAL',v_seed2,v_seed3,'SCHEDULED',v_final,'AWAY',v_third,CASE WHEN v_third IS NULL THEN NULL ELSE 'AWAY' END) RETURNING id INTO v_sf2;
      PERFORM public.initialize_match_sets(v_sf1); PERFORM public.initialize_match_sets(v_sf2);
    END IF;
    UPDATE public.tournaments SET status='LIVE',updated_at=now() WHERE id=v_stage.tournament_id;
  END IF;

  SELECT organization_id INTO v_org FROM public.tournaments WHERE id=v_stage.tournament_id;
  v_result:=jsonb_build_object('plan_id',v_plan,'source_stage_id',p_stage_id,'target_stage_id',v_target,'decision',p_decision,'include_third_place',p_include_third_place,'standings',v_standings,'semifinal_ids',jsonb_build_array(v_sf1,v_sf2),'final_id',v_final,'third_place_id',v_third,'idempotent',false);
  INSERT INTO public.audit_logs(organization_id,tournament_id,user_id,action,entity_type,entity_id,before_json,after_json,reason)
  VALUES(v_org,v_stage.tournament_id,auth.uid(),'LEAGUE_PROGRESSION_CONFIRMED','TOURNAMENT_PROGRESSION_PLAN',v_plan,
    jsonb_build_object('source_stage_id',p_stage_id,'tournament_status',v_before_tournament_status),v_result,'League completion decision confirmed');
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.apply_league_progression(uuid,text,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_league_progression(uuid,text,boolean,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.progress_completed_match()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_next public.matches%ROWTYPE; v_loser_next public.matches%ROWTYPE; v_stage_type text; v_next_stage uuid; v_loser uuid; v_plan public.tournament_progression_plans%ROWTYPE;
BEGIN
  IF NEW.status<>'COMPLETED' OR NEW.winner_team_id IS NULL OR (OLD.status='COMPLETED' AND OLD.winner_team_id=NEW.winner_team_id) THEN RETURN NEW; END IF;
  SELECT stage_type INTO v_stage_type FROM public.tournament_stages WHERE id=NEW.stage_id;
  IF v_stage_type='KNOCKOUT' THEN
    v_loser:=CASE WHEN NEW.winner_team_id=NEW.home_team_id THEN NEW.away_team_id ELSE NEW.home_team_id END;
    PERFORM 1 FROM public.matches WHERE id IN (NEW.next_match_id,NEW.loser_next_match_id) ORDER BY id FOR UPDATE;
    IF NEW.next_match_id IS NOT NULL THEN
      SELECT * INTO v_next FROM public.matches WHERE id=NEW.next_match_id;
      IF NEW.next_match_slot='HOME' THEN
        IF v_next.home_team_id IS NOT NULL AND v_next.home_team_id<>NEW.winner_team_id THEN RAISE EXCEPTION 'Knockout home slot is already occupied'; END IF;
        UPDATE public.matches SET home_team_id=NEW.winner_team_id,updated_at=now() WHERE id=v_next.id;
      ELSE
        IF v_next.away_team_id IS NOT NULL AND v_next.away_team_id<>NEW.winner_team_id THEN RAISE EXCEPTION 'Knockout away slot is already occupied'; END IF;
        UPDATE public.matches SET away_team_id=NEW.winner_team_id,updated_at=now() WHERE id=v_next.id;
      END IF;
      IF (SELECT home_team_id IS NOT NULL AND away_team_id IS NOT NULL FROM public.matches WHERE id=v_next.id) THEN PERFORM public.initialize_match_sets(v_next.id); END IF;
    END IF;
    IF NEW.loser_next_match_id IS NOT NULL AND v_loser IS NOT NULL THEN
      SELECT * INTO v_loser_next FROM public.matches WHERE id=NEW.loser_next_match_id;
      IF NEW.loser_next_match_slot='HOME' THEN
        IF v_loser_next.home_team_id IS NOT NULL AND v_loser_next.home_team_id<>v_loser THEN RAISE EXCEPTION 'Third-place home slot is already occupied'; END IF;
        UPDATE public.matches SET home_team_id=v_loser,updated_at=now() WHERE id=v_loser_next.id;
      ELSE
        IF v_loser_next.away_team_id IS NOT NULL AND v_loser_next.away_team_id<>v_loser THEN RAISE EXCEPTION 'Third-place away slot is already occupied'; END IF;
        UPDATE public.matches SET away_team_id=v_loser,updated_at=now() WHERE id=v_loser_next.id;
      END IF;
      IF (SELECT home_team_id IS NOT NULL AND away_team_id IS NOT NULL FROM public.matches WHERE id=v_loser_next.id) THEN PERFORM public.initialize_match_sets(v_loser_next.id); END IF;
    END IF;
  END IF;

  IF NOT EXISTS(SELECT 1 FROM public.matches WHERE stage_id=NEW.stage_id AND status<>'COMPLETED') THEN
    UPDATE public.tournament_stages SET status='COMPLETED' WHERE id=NEW.stage_id;
    SELECT id INTO v_next_stage FROM public.tournament_stages WHERE tournament_id=NEW.tournament_id AND sequence>(SELECT sequence FROM public.tournament_stages WHERE id=NEW.stage_id) ORDER BY sequence LIMIT 1;
    IF v_next_stage IS NOT NULL THEN
      UPDATE public.tournament_stages SET status='ACTIVE' WHERE id=v_next_stage AND status='PENDING';
    ELSIF v_stage_type='LEAGUE' THEN
      SELECT * INTO v_plan FROM public.tournament_progression_plans WHERE source_stage_id=NEW.stage_id;
      IF v_plan.id IS NOT NULL AND v_plan.decision='FINISH_AFTER_LEAGUE' THEN UPDATE public.tournaments SET status='COMPLETED',updated_at=now() WHERE id=NEW.tournament_id; END IF;
      -- Without a persisted decision the tournament deliberately remains open.
    ELSE
      UPDATE public.tournaments SET status='COMPLETED',updated_at=now() WHERE id=NEW.tournament_id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

--------------------------------------------------------------------------------
-- 3. SAFE PUBLIC FIXTURE STRUCTURE
--------------------------------------------------------------------------------

DROP VIEW public.public_fixture_view;
CREATE VIEW public.public_fixture_view WITH (security_invoker = true) AS
SELECT
  m.id,m.tournament_id,m.stage_id,m.match_number,m.home_team_id,m.away_team_id,
  m.scheduled_at,m.venue,m.court,m.status,m.winner_team_id,
  (SELECT SUM(home_score) FROM public.match_sets WHERE match_id=m.id) AS total_home_score,
  (SELECT SUM(away_score) FROM public.match_sets WHERE match_id=m.id) AS total_away_score,
  (SELECT COUNT(*) FROM public.match_sets WHERE match_id=m.id AND winner_team_id=m.home_team_id) AS home_sets_won,
  (SELECT COUNT(*) FROM public.match_sets WHERE match_id=m.id AND winner_team_id=m.away_team_id) AS away_sets_won,
  m.round_number,m.bracket_position,m.program_order,m.bracket_match_type
FROM public.matches m
JOIN public.tournaments tourn ON tourn.id=m.tournament_id
WHERE tourn.is_public=true;
GRANT SELECT ON public.public_fixture_view TO anon, authenticated;

-- Preserve M31: no public score-event reads and no obsolete revealed-lot view.
DROP POLICY IF EXISTS "Public can read score events" ON public.score_events;
