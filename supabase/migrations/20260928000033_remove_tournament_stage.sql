-- M33: authoritative, transactional tournament-stage removal.

CREATE OR REPLACE FUNCTION public.preview_tournament_stage_removal(p_stage_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_stage public.tournament_stages%ROWTYPE;
  v_fixtures integer;
  v_live integer;
  v_completed integer;
  v_score_history integer;
  v_match_sets integer;
  v_scorers integer;
  v_standings integer;
  v_standings_rules integer;
  v_rule_overrides integer;
  v_set_rule_overrides integer;
  v_ordering_scopes integer;
  v_progression integer;
  v_external_routes integer;
  v_blockers jsonb := '[]'::jsonb;
  v_snapshot text;
  v_phrase text;
BEGIN
  SELECT * INTO v_stage FROM public.tournament_stages WHERE id = p_stage_id;
  IF v_stage.id IS NULL THEN RAISE EXCEPTION 'Stage not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(v_stage.tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT count(*)::integer,
         count(*) FILTER (WHERE status = 'LIVE')::integer,
         count(*) FILTER (WHERE status = 'COMPLETED')::integer
    INTO v_fixtures, v_live, v_completed
  FROM public.matches WHERE stage_id = p_stage_id;

  SELECT count(*)::integer INTO v_match_sets
  FROM public.match_sets ms JOIN public.matches m ON m.id = ms.match_id
  WHERE m.stage_id = p_stage_id;
  SELECT count(*)::integer INTO v_scorers
  FROM public.match_scorers ms JOIN public.matches m ON m.id = ms.match_id
  WHERE m.stage_id = p_stage_id;
  SELECT count(*)::integer INTO v_score_history
  FROM public.score_events se JOIN public.matches m ON m.id = se.match_id
  WHERE m.stage_id = p_stage_id;
  -- Treat any independently observable scoring state as history, even if an
  -- event stream was imported incompletely.
  IF EXISTS (
    SELECT 1 FROM public.match_sets ms JOIN public.matches m ON m.id = ms.match_id
    WHERE m.stage_id = p_stage_id AND
      (ms.status <> 'PENDING' OR ms.home_score <> 0 OR ms.away_score <> 0 OR ms.started_at IS NOT NULL OR ms.completed_at IS NOT NULL)
  ) THEN v_score_history := GREATEST(v_score_history, 1); END IF;

  SELECT count(*)::integer INTO v_standings FROM public.standings WHERE stage_id = p_stage_id;
  SELECT count(*)::integer INTO v_standings_rules FROM public.standings_rules WHERE stage_id = p_stage_id;
  SELECT count(*)::integer INTO v_rule_overrides FROM public.volleyball_rules WHERE stage_id = p_stage_id;
  SELECT count(*)::integer INTO v_set_rule_overrides
  FROM public.volleyball_set_rules sr JOIN public.volleyball_rules vr ON vr.id = sr.volleyball_rule_id
  WHERE vr.stage_id = p_stage_id;
  SELECT count(*)::integer INTO v_ordering_scopes FROM public.match_order_scopes WHERE stage_id = p_stage_id;
  SELECT count(*)::integer INTO v_progression FROM public.tournament_progression_plans
  WHERE source_stage_id = p_stage_id OR target_stage_id = p_stage_id;
  SELECT count(*)::integer INTO v_external_routes FROM (
    SELECT dependent.id
    FROM public.matches dependent
    WHERE dependent.stage_id IS DISTINCT FROM p_stage_id AND
      (dependent.next_match_id IN (SELECT id FROM public.matches WHERE stage_id = p_stage_id)
        OR dependent.loser_next_match_id IN (SELECT id FROM public.matches WHERE stage_id = p_stage_id))
    UNION ALL
    SELECT owned.id
    FROM public.matches owned
    WHERE owned.stage_id = p_stage_id AND
      (owned.next_match_id IN (SELECT id FROM public.matches WHERE stage_id IS DISTINCT FROM p_stage_id)
        OR owned.loser_next_match_id IN (SELECT id FROM public.matches WHERE stage_id IS DISTINCT FROM p_stage_id))
  ) cross_stage_routes;

  IF v_live > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','LIVE_MATCHES','message',format('%s fixture(s) are live.',v_live)));
  END IF;
  IF v_completed > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','COMPLETED_MATCHES','message',format('%s fixture(s) are completed.',v_completed)));
  END IF;
  IF v_score_history > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','SCORE_HISTORY','message','Scoring history exists for this stage.'));
  END IF;
  IF v_progression > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','PROGRESSION_DEPENDENCY','message',format('%s progression plan(s) depend on this stage.',v_progression)));
  END IF;
  IF v_external_routes > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','BRACKET_DEPENDENCY','message',format('%s fixture route(s) from another stage depend on this stage.',v_external_routes)));
  END IF;

  SELECT md5(concat_ws('|',
    v_stage.id::text, v_stage.tournament_id::text, v_stage.name, v_stage.sequence::text,
    COALESCE((SELECT string_agg(concat_ws(':',id,status,updated_at),',' ORDER BY id) FROM public.matches WHERE stage_id=p_stage_id),''),
    COALESCE((SELECT string_agg(se.id::text,',' ORDER BY se.id) FROM public.score_events se JOIN public.matches m ON m.id=se.match_id WHERE m.stage_id=p_stage_id),''),
    v_match_sets::text, v_scorers::text, v_standings::text, v_standings_rules::text,
    v_rule_overrides::text, v_set_rule_overrides::text, v_ordering_scopes::text,
    v_progression::text, v_external_routes::text
  )) INTO v_snapshot;
  v_phrase := CASE WHEN v_fixtures = 0
    THEN format('REMOVE STAGE %s', v_stage.name)
    ELSE format('REMOVE STAGE %s AND %s FIXTURES', v_stage.name, v_fixtures) END;

  RETURN jsonb_build_object(
    'stage_id',v_stage.id,'tournament_id',v_stage.tournament_id,'stage_name',v_stage.name,
    'allowed',jsonb_array_length(v_blockers)=0,'requires_strong_confirmation',v_fixtures>0,
    'confirmation_phrase',v_phrase,'snapshot',v_snapshot,'blockers',v_blockers,
    'remove',jsonb_build_object(
      'stage',1,'fixtures',v_fixtures,'match_sets',v_match_sets,'scorer_assignments',v_scorers,
      'standings',v_standings,'standings_rules',v_standings_rules,
      'volleyball_rule_overrides',v_rule_overrides,'volleyball_set_rule_overrides',v_set_rule_overrides,
      'ordering_scopes',v_ordering_scopes
    ),
    'preserve',jsonb_build_array('tournament teams','team owners','player registrations','squads','auction and lot results','Icon and Setter assignments','branding','tournament-level volleyball rules')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_tournament_stage(
  p_stage_id uuid,
  p_expected_snapshot text,
  p_confirmation text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_stage public.tournament_stages%ROWTYPE;
  v_plan jsonb;
  v_org uuid;
  v_fixture_ids uuid[];
  v_sequence_offset integer;
BEGIN
  -- This row lock serializes removal with fixture generation and prevents new
  -- children from acquiring a foreign-key key-share lock once deletion begins.
  SELECT * INTO v_stage FROM public.tournament_stages WHERE id=p_stage_id FOR UPDATE;
  IF v_stage.id IS NULL THEN RAISE EXCEPTION 'Stage not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(v_stage.tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  PERFORM 1 FROM public.matches WHERE stage_id=p_stage_id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.tournament_progression_plans
    WHERE source_stage_id=p_stage_id OR target_stage_id=p_stage_id ORDER BY id FOR UPDATE;
  v_plan := public.preview_tournament_stage_removal(p_stage_id);
  IF NOT (v_plan->>'allowed')::boolean THEN
    RAISE EXCEPTION 'Stage cannot be removed: %', (
      SELECT string_agg(item->>'message',' ') FROM jsonb_array_elements(v_plan->'blockers') item
    );
  END IF;
  IF p_expected_snapshot IS NULL OR p_expected_snapshot <> v_plan->>'snapshot' THEN
    RAISE EXCEPTION 'Stage changed after the removal preview. Review the updated removal details and try again.';
  END IF;
  IF p_confirmation IS DISTINCT FROM v_plan->>'confirmation_phrase' THEN
    RAISE EXCEPTION 'Confirmation phrase does not match';
  END IF;

  SELECT array_agg(id ORDER BY id) INTO v_fixture_ids FROM public.matches WHERE stage_id=p_stage_id;
  SELECT organization_id INTO v_org FROM public.tournaments WHERE id=v_stage.tournament_id;
  INSERT INTO public.audit_logs(organization_id,tournament_id,user_id,action,entity_type,entity_id,before_json,after_json,reason)
  VALUES(v_org,v_stage.tournament_id,auth.uid(),'TOURNAMENT_STAGE_REMOVED','TOURNAMENT_STAGE',v_stage.id,
    jsonb_build_object('stage',to_jsonb(v_stage),'removal_plan',v_plan,'fixture_ids',COALESCE(to_jsonb(v_fixture_ids),'[]'::jsonb)),
    jsonb_build_object('removed',true),'Organizer confirmed tournament stage removal');

  -- Break only routes owned by matches that are themselves being removed.
  UPDATE public.matches SET next_match_id=NULL,next_match_slot=NULL,loser_next_match_id=NULL,loser_next_match_slot=NULL
  WHERE stage_id=p_stage_id;
  DELETE FROM public.matches WHERE stage_id=p_stage_id;
  DELETE FROM public.tournament_stages WHERE id=p_stage_id;

  -- Close the stage-order gap without colliding with the unique constraint.
  SELECT COALESCE(max(sequence),0)+1 INTO v_sequence_offset
  FROM public.tournament_stages WHERE tournament_id=v_stage.tournament_id;
  UPDATE public.tournament_stages SET sequence=sequence+v_sequence_offset
  WHERE tournament_id=v_stage.tournament_id AND sequence>v_stage.sequence;
  UPDATE public.tournament_stages SET sequence=sequence-v_sequence_offset-1
  WHERE tournament_id=v_stage.tournament_id AND sequence>v_sequence_offset;

  RETURN jsonb_build_object('removed',true,'stage_id',p_stage_id,'tournament_id',v_stage.tournament_id,'removed_counts',v_plan->'remove');
END;
$$;

REVOKE ALL ON FUNCTION public.preview_tournament_stage_removal(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_tournament_stage(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_tournament_stage_removal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_tournament_stage(uuid,text,text) TO authenticated;
