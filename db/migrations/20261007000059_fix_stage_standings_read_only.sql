-- STABLE functions cannot INSERT; the 0-0-0 rows already come from the teams LEFT JOIN.
CREATE OR REPLACE FUNCTION public.get_stage_standings(p_stage_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_tournament uuid; v_public boolean; v_rules jsonb; v_result jsonb; v_order text:='COALESCE(s.league_points, 0) DESC'; v_rule text;
BEGIN
  SELECT ts.tournament_id,t.is_public INTO v_tournament,v_public FROM public.tournament_stages ts JOIN public.tournaments t ON t.id=ts.tournament_id WHERE ts.id=p_stage_id;
  IF v_tournament IS NULL OR NOT (v_public OR public.is_tournament_member(v_tournament) OR public.is_tournament_organizer(v_tournament)) THEN RAISE EXCEPTION 'Stage not available'; END IF;

  SELECT COALESCE(tie_break_rules,'["WINS","SET_DIFFERENCE","POINT_DIFFERENCE","NAME"]'::jsonb) INTO v_rules FROM public.standings_rules WHERE stage_id=p_stage_id;
  IF v_rules IS NULL THEN v_rules:='["WINS","SET_DIFFERENCE","POINT_DIFFERENCE","NAME"]'::jsonb; END IF;

  FOR v_rule IN SELECT jsonb_array_elements_text(v_rules) LOOP
    v_order:=v_order||CASE v_rule
      WHEN 'WINS' THEN ',COALESCE(s.won,0) DESC'
      WHEN 'SET_DIFFERENCE' THEN ',(COALESCE(s.sets_won,0)-COALESCE(s.sets_lost,0)) DESC'
      WHEN 'SET_RATIO' THEN ',CASE WHEN COALESCE(s.sets_lost,0)=0 THEN COALESCE(s.sets_won,0)::numeric ELSE s.sets_won::numeric/s.sets_lost END DESC'
      WHEN 'POINT_DIFFERENCE' THEN ',(COALESCE(s.points_for,0)-COALESCE(s.points_against,0)) DESC'
      WHEN 'POINT_RATIO' THEN ',CASE WHEN COALESCE(s.points_against,0)=0 THEN COALESCE(s.points_for,0)::numeric ELSE s.points_for::numeric/s.points_against END DESC'
      WHEN 'NAME' THEN ',t.name ASC'
      ELSE '' END;
  END LOOP;
  v_order:=v_order||',t.id ASC';

  EXECUTE 'SELECT COALESCE(jsonb_agg(row_data ORDER BY rank),''[]''::jsonb)
           FROM (
             SELECT row_number() OVER(ORDER BY '||v_order||') rank,
                    jsonb_build_object(
                      ''rank'', row_number() OVER(ORDER BY '||v_order||'),
                      ''team_id'', t.id,
                      ''team_name'', t.name,
                      ''played'', COALESCE(s.played, 0),
                      ''won'', COALESCE(s.won, 0),
                      ''lost'', COALESCE(s.lost, 0),
                      ''league_points'', COALESCE(s.league_points, 0),
                      ''sets_won'', COALESCE(s.sets_won, 0),
                      ''sets_lost'', COALESCE(s.sets_lost, 0),
                      ''points_for'', COALESCE(s.points_for, 0),
                      ''points_against'', COALESCE(s.points_against, 0)
                    ) row_data
             FROM public.teams t
             LEFT JOIN public.standings s ON s.team_id = t.id AND s.stage_id = $1
             WHERE t.tournament_id = $2 AND t.status = ''ACTIVE''
           ) ranked' INTO v_result USING p_stage_id, v_tournament;

  RETURN v_result;
END; $$;
