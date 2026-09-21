BEGIN;

DO $$
DECLARE
  v_tournament uuid;
  v_other_tournament uuid;
  v_actor uuid;
  v_primary uuid;
  v_target uuid;
  v_email text;
  v_result jsonb;
  v_roles text[];
BEGIN
  SELECT t.id, tm.user_id, t.created_by
  INTO v_tournament, v_actor, v_primary
  FROM public.tournaments t
  JOIN public.tournament_members tm
    ON tm.tournament_id = t.id
   AND tm.role = 'ORGANIZER'
   AND tm.status = 'ACTIVE'
  LIMIT 1;

  IF v_tournament IS NULL THEN
    RAISE EXCEPTION 'Test fixture needs an organizer tournament';
  END IF;

  SELECT p.id, u.email
  INTO v_target, v_email
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.status = 'ACTIVE'
    AND u.email IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.tournament_members tm
      WHERE tm.tournament_id = v_tournament AND tm.user_id = p.id
    )
    AND (SELECT count(*) FROM auth.users ux WHERE lower(btrim(ux.email)) = lower(btrim(u.email))) = 1
  LIMIT 1;

  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Test fixture needs an unassigned active account';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_result := public.add_tournament_staff_role(v_tournament, upper(v_email), 'SCORER');
  IF NOT coalesce((v_result->>'ok')::boolean, false) THEN
    RAISE EXCEPTION 'Adding scorer failed: %', v_result;
  END IF;

  v_result := public.add_tournament_staff_role(v_tournament, v_email, 'ORGANIZER');
  IF NOT coalesce((v_result->>'ok')::boolean, false) THEN
    RAISE EXCEPTION 'Adding organizer failed: %', v_result;
  END IF;

  SELECT roles INTO v_roles
  FROM public.get_tournament_staff(v_tournament)
  WHERE user_id = v_target;
  IF v_roles IS NULL OR NOT (v_roles @> ARRAY['ORGANIZER', 'SCORER']) THEN
    RAISE EXCEPTION 'Grouped multi-role staff result failed: %', v_roles;
  END IF;

  v_result := public.add_tournament_staff_role(v_tournament, v_email, 'SCORER');
  IF v_result->>'code' <> 'ROLE_ALREADY_ASSIGNED' THEN
    RAISE EXCEPTION 'Duplicate role was not rejected: %', v_result;
  END IF;

  IF public.add_tournament_staff_role(v_tournament, 'not-an-email', 'SCORER')->>'code' <> 'INVALID_EMAIL' THEN
    RAISE EXCEPTION 'Malformed email was not rejected';
  END IF;
  IF public.add_tournament_staff_role(v_tournament, 'missing-account@example.invalid', 'SCORER')->>'code' <> 'ACCOUNT_NOT_FOUND' THEN
    RAISE EXCEPTION 'Unknown email was not rejected safely';
  END IF;
  IF public.add_tournament_staff_role(v_tournament, v_email, 'PLAYER')->>'code' <> 'UNSUPPORTED_ROLE' THEN
    RAISE EXCEPTION 'Unsupported role was not rejected';
  END IF;

  v_result := public.remove_tournament_staff_role(v_tournament, v_target, 'SCORER');
  IF NOT coalesce((v_result->>'ok')::boolean, false)
     OR NOT EXISTS (
       SELECT 1 FROM public.tournament_members
       WHERE tournament_id = v_tournament AND user_id = v_target AND role = 'ORGANIZER'
     ) THEN
    RAISE EXCEPTION 'Removing scorer did not preserve organizer';
  END IF;

  v_result := public.remove_tournament_staff_role(v_tournament, v_target, 'ORGANIZER');
  IF NOT coalesce((v_result->>'ok')::boolean, false) THEN
    RAISE EXCEPTION 'Removing organizer failed: %', v_result;
  END IF;

  v_result := public.add_tournament_staff_role(v_tournament, v_email, 'SCORER');
  IF NOT coalesce((v_result->>'ok')::boolean, false) THEN
    RAISE EXCEPTION 'Scorer-only setup failed: %', v_result;
  END IF;

  v_result := public.remove_tournament_staff_role(v_tournament, v_primary, 'ORGANIZER');
  IF v_result->>'code' <> 'PRIMARY_ORGANIZER_PROTECTED' THEN
    RAISE EXCEPTION 'Primary organizer was not protected: %', v_result;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_target::text, true);
  v_result := public.add_tournament_staff_role(v_tournament, v_email, 'SCORER');
  IF v_result->>'code' <> 'UNAUTHORIZED' THEN
    RAISE EXCEPTION 'Scorer-only staff mutation was not denied: %', v_result;
  END IF;
  v_result := public.update_tournament_details(v_tournament, 'Denied update');
  IF v_result->>'code' <> 'UNAUTHORIZED' THEN
    RAISE EXCEPTION 'Scorer-only details mutation was not denied: %', v_result;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
  v_result := public.update_tournament_details(v_tournament, '  Migration 21 Test  ', '  Test Venue  ', DATE '2026-10-01', DATE '2026-10-02', '  Test description  ', NULL);
  IF NOT coalesce((v_result->>'ok')::boolean, false)
     OR NOT EXISTS (
       SELECT 1 FROM public.tournaments
       WHERE id = v_tournament
         AND name = 'Migration 21 Test'
         AND venue = 'Test Venue'
         AND description = 'Test description'
     ) THEN
    RAISE EXCEPTION 'Authorized tournament detail update failed: %', v_result;
  END IF;
  v_result := public.update_tournament_details(v_tournament, 'Date test', NULL, DATE '2026-10-02', DATE '2026-10-01');
  IF v_result->>'code' <> 'INVALID_DATE_RANGE' THEN
    RAISE EXCEPTION 'Invalid date range was not rejected: %', v_result;
  END IF;

  SELECT t.id INTO v_other_tournament
  FROM public.tournaments t
  WHERE t.id <> v_tournament
    AND NOT public.is_tournament_organizer(t.id)
  LIMIT 1;
  IF v_other_tournament IS NOT NULL THEN
    v_result := public.add_tournament_staff_role(v_other_tournament, v_email, 'SCORER');
    IF v_result->>'code' <> 'UNAUTHORIZED' THEN
      RAISE EXCEPTION 'Cross-tournament mutation was not denied: %', v_result;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE tournament_id = v_tournament
      AND entity_id = v_target
      AND action IN ('ORGANIZER_ROLE_GRANTED', 'SCORER_ROLE_GRANTED', 'ORGANIZER_ROLE_REMOVED', 'SCORER_ROLE_REMOVED')
  ) THEN
    RAISE EXCEPTION 'Staff audit entries were not written';
  END IF;
END;
$$;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.tournament_members', 'INSERT')
     OR has_table_privilege('authenticated', 'public.tournament_members', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.tournament_members', 'DELETE') THEN
    RAISE EXCEPTION 'Direct authenticated membership mutation remains granted';
  END IF;
END;
$$;

ROLLBACK;
