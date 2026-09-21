BEGIN;

SELECT extensions.plan(1);

DO $$
DECLARE
  v_result jsonb;
  v_profile_before jsonb;
  v_profile_after jsonb;
  v_registration_before jsonb;
  v_registration_after jsonb;
BEGIN
  INSERT INTO auth.users (id) VALUES
    ('22000000-0000-0000-0000-000000000001'),
    ('22000000-0000-0000-0000-000000000002'),
    ('22000000-0000-0000-0000-000000000003'),
    ('22000000-0000-0000-0000-000000000004'),
    ('22000000-0000-0000-0000-000000000005'),
    ('22000000-0000-0000-0000-000000000006'),
    ('22000000-0000-0000-0000-000000000007'),
    ('22000000-0000-0000-0000-000000000008'),
    ('22000000-0000-0000-0000-000000000009');

  UPDATE public.profiles
  SET full_name = CASE id
    WHEN '22000000-0000-0000-0000-000000000001' THEN 'Organizer A'
    WHEN '22000000-0000-0000-0000-000000000002' THEN 'Organizer B'
    WHEN '22000000-0000-0000-0000-000000000003' THEN 'Scorer'
    WHEN '22000000-0000-0000-0000-000000000004' THEN 'Ordinary User'
    WHEN '22000000-0000-0000-0000-000000000005' THEN 'Approved Player'
    WHEN '22000000-0000-0000-0000-000000000006' THEN 'Rejected Player'
    WHEN '22000000-0000-0000-0000-000000000007' THEN 'Pending Player'
    WHEN '22000000-0000-0000-0000-000000000008' THEN 'Changes Player'
    WHEN '22000000-0000-0000-0000-000000000009' THEN 'Assigned Player'
  END
  WHERE id::text LIKE '22000000-0000-0000-0000-00000000000%';

  INSERT INTO public.organizations (id, name, slug, created_by) VALUES
    ('22100000-0000-0000-0000-000000000001', 'Migration 22 Org A', 'migration-22-org-a', '22000000-0000-0000-0000-000000000001'),
    ('22100000-0000-0000-0000-000000000002', 'Migration 22 Org B', 'migration-22-org-b', '22000000-0000-0000-0000-000000000002');

  INSERT INTO public.tournaments (id, organization_id, name, slug, format, created_by) VALUES
    ('22200000-0000-0000-0000-000000000001', '22100000-0000-0000-0000-000000000001', 'Migration 22 A', 'migration-22-a', 'KNOCKOUT', '22000000-0000-0000-0000-000000000001'),
    ('22200000-0000-0000-0000-000000000002', '22100000-0000-0000-0000-000000000002', 'Migration 22 B', 'migration-22-b', 'KNOCKOUT', '22000000-0000-0000-0000-000000000002');

  INSERT INTO public.tournament_members (tournament_id, user_id, role, status) VALUES
    ('22200000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', 'ORGANIZER', 'ACTIVE'),
    ('22200000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000002', 'ORGANIZER', 'ACTIVE'),
    ('22200000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000003', 'SCORER', 'ACTIVE');

  INSERT INTO public.player_profiles (
    id, user_id, display_name, photo_path, primary_position, secondary_position, playing_history
  ) VALUES
    ('22300000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000005', 'Approved Player', 'approved/photo.jpg', 'SETTER', 'OPPOSITE', 'Preserve me'),
    ('22300000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000006', 'Rejected Player', 'rejected/photo.jpg', 'LIBERO', 'UNIVERSAL', 'Preserve me'),
    ('22300000-0000-0000-0000-000000000003', '22000000-0000-0000-0000-000000000007', 'Pending Player', NULL, 'MIDDLE_BLOCKER', NULL, NULL),
    ('22300000-0000-0000-0000-000000000004', '22000000-0000-0000-0000-000000000008', 'Changes Player', NULL, 'OUTSIDE_HITTER', NULL, NULL),
    ('22300000-0000-0000-0000-000000000005', '22000000-0000-0000-0000-000000000009', 'Assigned Player', NULL, 'SETTER', NULL, NULL);

  INSERT INTO public.player_tournament_registrations (
    id, tournament_id, player_id, registration_number, status, auction_category, review_notes, reviewed_by, reviewed_at
  ) VALUES
    ('22400000-0000-0000-0000-000000000001', '22200000-0000-0000-0000-000000000001', '22300000-0000-0000-0000-000000000001', 'M22-1', 'APPROVED', 'ICON_LOT', 'Approved note', '22000000-0000-0000-0000-000000000001', now()),
    ('22400000-0000-0000-0000-000000000002', '22200000-0000-0000-0000-000000000001', '22300000-0000-0000-0000-000000000002', 'M22-2', 'REJECTED', 'SETTER_LOT', 'Rejected note', '22000000-0000-0000-0000-000000000001', now()),
    ('22400000-0000-0000-0000-000000000003', '22200000-0000-0000-0000-000000000001', '22300000-0000-0000-0000-000000000003', 'M22-3', 'PENDING', 'MAIN_AUCTION', NULL, NULL, NULL),
    ('22400000-0000-0000-0000-000000000004', '22200000-0000-0000-0000-000000000001', '22300000-0000-0000-0000-000000000004', 'M22-4', 'CHANGES_REQUESTED', NULL, NULL, NULL, NULL),
    ('22400000-0000-0000-0000-000000000005', '22200000-0000-0000-0000-000000000001', '22300000-0000-0000-0000-000000000005', 'M22-5', 'APPROVED', NULL, NULL, NULL, NULL);

  INSERT INTO public.teams (id, tournament_id, name) VALUES
    ('22500000-0000-0000-0000-000000000001', '22200000-0000-0000-0000-000000000001', 'Assigned Team');
  INSERT INTO public.team_players (tournament_id, team_id, player_id, acquisition_type) VALUES
    ('22200000-0000-0000-0000-000000000001', '22500000-0000-0000-0000-000000000001', '22300000-0000-0000-0000-000000000005', 'MANUAL');

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000001', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  IF public.revoke_player_approval('22400000-0000-0000-0000-000000000003')->>'code' <> 'INVALID_STATUS'
     OR public.reopen_player_registration('22400000-0000-0000-0000-000000000003')->>'code' <> 'INVALID_STATUS' THEN
    RAISE EXCEPTION 'PENDING invalid transitions were not denied';
  END IF;
  IF public.revoke_player_approval('22400000-0000-0000-0000-000000000004')->>'code' <> 'INVALID_STATUS'
     OR public.reopen_player_registration('22400000-0000-0000-0000-000000000004')->>'code' <> 'INVALID_STATUS' THEN
    RAISE EXCEPTION 'CHANGES_REQUESTED invalid transitions were not denied';
  END IF;
  IF public.reopen_player_registration('22400000-0000-0000-0000-000000000001')->>'code' <> 'INVALID_STATUS'
     OR public.revoke_player_approval('22400000-0000-0000-0000-000000000002')->>'code' <> 'INVALID_STATUS' THEN
    RAISE EXCEPTION 'Opposite correction operations were not denied';
  END IF;

  SELECT to_jsonb(pp) INTO v_profile_before FROM public.player_profiles pp WHERE id = '22300000-0000-0000-0000-000000000001';
  SELECT to_jsonb(r) - ARRAY['status', 'reviewed_by', 'reviewed_at', 'updated_at'] INTO v_registration_before
  FROM public.player_tournament_registrations r WHERE id = '22400000-0000-0000-0000-000000000001';

  v_result := public.revoke_player_approval('22400000-0000-0000-0000-000000000001', 'Accidental approval');
  IF NOT coalesce((v_result->>'ok')::boolean, false) THEN
    RAISE EXCEPTION 'APPROVED -> PENDING failed: %', v_result;
  END IF;

  SELECT to_jsonb(pp) INTO v_profile_after FROM public.player_profiles pp WHERE id = '22300000-0000-0000-0000-000000000001';
  SELECT to_jsonb(r) - ARRAY['status', 'reviewed_by', 'reviewed_at', 'updated_at'] INTO v_registration_after
  FROM public.player_tournament_registrations r WHERE id = '22400000-0000-0000-0000-000000000001';
  IF v_profile_before IS DISTINCT FROM v_profile_after OR v_registration_before IS DISTINCT FROM v_registration_after THEN
    RAISE EXCEPTION 'Revoke did not preserve profile/registration/classification data';
  END IF;

  v_result := public.reopen_player_registration('22400000-0000-0000-0000-000000000002', 'Accidental rejection');
  IF NOT coalesce((v_result->>'ok')::boolean, false) THEN
    RAISE EXCEPTION 'REJECTED -> PENDING failed: %', v_result;
  END IF;

  v_result := public.revoke_player_approval('22400000-0000-0000-0000-000000000005');
  IF v_result->>'code' <> 'DOWNSTREAM_ASSIGNMENTS' THEN
    RAISE EXCEPTION 'Downstream team assignment was not protected: %', v_result;
  END IF;

  IF (SELECT count(*) FROM public.audit_logs WHERE entity_id IN (
      '22400000-0000-0000-0000-000000000001',
      '22400000-0000-0000-0000-000000000002'
    ) AND action IN ('PLAYER_APPROVAL_REVOKED', 'PLAYER_APPLICATION_REOPENED')) <> 2 THEN
    RAISE EXCEPTION 'Expected atomic correction audit records were not created';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE entity_id = '22400000-0000-0000-0000-000000000001'
      AND action = 'PLAYER_APPROVAL_REVOKED'
      AND before_json->>'status' = 'APPROVED'
      AND after_json->>'status' = 'PENDING'
      AND reason = 'Accidental approval'
      AND user_id = '22000000-0000-0000-0000-000000000001'
  ) THEN
    RAISE EXCEPTION 'Revoke audit context is incomplete';
  END IF;

  UPDATE public.player_tournament_registrations SET status = 'APPROVED' WHERE id = '22400000-0000-0000-0000-000000000003';

  PERFORM set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000003', true);
  IF public.revoke_player_approval('22400000-0000-0000-0000-000000000003')->>'code' <> 'UNAUTHORIZED' THEN
    RAISE EXCEPTION 'Scorer-only correction was not denied';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000004', true);
  IF public.revoke_player_approval('22400000-0000-0000-0000-000000000003')->>'code' <> 'UNAUTHORIZED' THEN
    RAISE EXCEPTION 'Ordinary authenticated correction was not denied';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000002', true);
  IF public.revoke_player_approval('22400000-0000-0000-0000-000000000003')->>'code' <> 'UNAUTHORIZED' THEN
    RAISE EXCEPTION 'Cross-tournament organizer correction was not denied';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF public.revoke_player_approval('22400000-0000-0000-0000-000000000003')->>'code' <> 'UNAUTHORIZED' THEN
    RAISE EXCEPTION 'Unauthenticated correction was not denied';
  END IF;
END;
$$;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.revoke_player_approval(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.reopen_player_registration(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role retains correction RPC execution';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.revoke_player_approval(uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.reopen_player_registration(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role lacks correction RPC execution';
  END IF;
END;
$$;

SELECT extensions.pass('Migration 22 decision correction security and preservation checks passed');
SELECT * FROM extensions.finish();

ROLLBACK;
