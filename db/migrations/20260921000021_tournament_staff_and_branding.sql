-- 20260921000021_tournament_staff_and_branding.sql
-- Secure tournament staff management and tournament details/branding updates.

--------------------------------------------------------------------------------
-- 1. FAIL-CLOSED EMAIL PRECHECK
--------------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT lower(btrim(email))
    FROM auth.users
    WHERE email IS NOT NULL
    GROUP BY lower(btrim(email))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Ambiguous normalized emails exist; resolve them before applying migration 21';
  END IF;
END;
$$;

--------------------------------------------------------------------------------
-- 2. STAFF READ API
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_tournament_staff(p_tournament_id uuid)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  email text,
  avatar_path text,
  roles text[],
  membership_status text,
  is_primary_organizer boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.email,
    p.avatar_path,
    array_agg(tm.role ORDER BY tm.role),
    CASE WHEN bool_or(tm.status = 'ACTIVE') THEN 'ACTIVE' ELSE 'DISABLED' END,
    p.id = t.created_by
  FROM public.tournament_members tm
  JOIN public.profiles p ON p.id = tm.user_id
  JOIN public.tournaments t ON t.id = tm.tournament_id
  WHERE tm.tournament_id = p_tournament_id
    AND tm.role IN ('ORGANIZER', 'SCORER')
  GROUP BY p.id, p.full_name, p.email, p.avatar_path, t.created_by
  ORDER BY (p.id = t.created_by) DESC, p.full_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_tournament_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tournament_staff(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_tournament_staff(uuid) TO authenticated;

--------------------------------------------------------------------------------
-- 3. STAFF MUTATION APIS
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.add_tournament_staff_role(
  p_tournament_id uuid,
  p_email text,
  p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text := lower(btrim(p_email));
  v_target uuid;
  v_match_count integer;
  v_organization_id uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  END IF;

  IF p_role IS NULL OR upper(p_role) NOT IN ('ORGANIZER', 'SCORER') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNSUPPORTED_ROLE');
  END IF;

  IF v_email IS NULL OR v_email = '' OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_EMAIL');
  END IF;

  SELECT count(*)
  INTO v_match_count
  FROM auth.users
  WHERE lower(btrim(email)) = v_email;

  IF v_match_count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ACCOUNT_NOT_FOUND');
  ELSIF v_match_count > 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AMBIGUOUS_EMAIL');
  END IF;

  SELECT id INTO v_target
  FROM auth.users
  WHERE lower(btrim(email)) = v_email;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_target AND status = 'ACTIVE') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ACCOUNT_NOT_AVAILABLE');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_members
    WHERE tournament_id = p_tournament_id
      AND user_id = v_target
      AND role = upper(p_role)
      AND status = 'ACTIVE'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROLE_ALREADY_ASSIGNED');
  END IF;

  SELECT organization_id INTO v_organization_id
  FROM public.tournaments WHERE id = p_tournament_id;

  INSERT INTO public.tournament_members (tournament_id, user_id, role, status)
  VALUES (p_tournament_id, v_target, upper(p_role), 'ACTIVE')
  ON CONFLICT (tournament_id, user_id, role)
  DO UPDATE SET status = 'ACTIVE', team_id = NULL;

  INSERT INTO public.audit_logs (
    organization_id, tournament_id, user_id, action, entity_type,
    entity_id, before_json, after_json, reason
  ) VALUES (
    v_organization_id, p_tournament_id, v_actor,
    upper(p_role) || '_ROLE_GRANTED', 'TOURNAMENT_MEMBER', v_target,
    NULL,
    jsonb_build_object('target_user_id', v_target, 'role', upper(p_role), 'status', 'ACTIVE'),
    'Tournament staff role granted'
  );

  RETURN jsonb_build_object('ok', true, 'code', 'ROLE_ASSIGNED', 'target_user_id', v_target);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_tournament_staff_role(
  p_tournament_id uuid,
  p_target_user_id uuid,
  p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_primary uuid;
  v_organization_id uuid;
  v_deleted integer;
BEGIN
  IF v_actor IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  END IF;

  IF p_role IS NULL OR upper(p_role) NOT IN ('ORGANIZER', 'SCORER') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNSUPPORTED_ROLE');
  END IF;

  SELECT created_by, organization_id INTO v_primary, v_organization_id
  FROM public.tournaments WHERE id = p_tournament_id;

  IF upper(p_role) = 'ORGANIZER' AND p_target_user_id = v_primary THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PRIMARY_ORGANIZER_PROTECTED');
  END IF;

  DELETE FROM public.tournament_members
  WHERE tournament_id = p_tournament_id
    AND user_id = p_target_user_id
    AND role = upper(p_role);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROLE_NOT_ASSIGNED');
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, tournament_id, user_id, action, entity_type,
    entity_id, before_json, after_json, reason
  ) VALUES (
    v_organization_id, p_tournament_id, v_actor,
    upper(p_role) || '_ROLE_REMOVED', 'TOURNAMENT_MEMBER', p_target_user_id,
    jsonb_build_object('target_user_id', p_target_user_id, 'role', upper(p_role), 'status', 'ACTIVE'),
    NULL,
    'Tournament staff role removed'
  );

  RETURN jsonb_build_object('ok', true, 'code', 'ROLE_REMOVED');
END;
$$;

REVOKE ALL ON FUNCTION public.add_tournament_staff_role(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_tournament_staff_role(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_tournament_staff_role(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.remove_tournament_staff_role(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_tournament_staff_role(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_tournament_staff_role(uuid, uuid, text) TO authenticated;

--------------------------------------------------------------------------------
-- 4. TOURNAMENT DETAILS API
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_tournament_details(
  p_tournament_id uuid,
  p_name text,
  p_venue text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_logo_path text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_name text := btrim(p_name);
  v_venue text := nullif(btrim(p_venue), '');
  v_description text := nullif(btrim(p_description), '');
  v_logo_path text := nullif(btrim(p_logo_path), '');
  v_before jsonb;
  v_organization_id uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  END IF;

  IF v_name IS NULL OR v_name = '' OR char_length(v_name) > 120 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_NAME');
  END IF;
  IF v_venue IS NOT NULL AND char_length(v_venue) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_VENUE');
  END IF;
  IF v_description IS NOT NULL AND char_length(v_description) > 2000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_DESCRIPTION');
  END IF;
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND p_end_date < p_start_date THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_DATE_RANGE');
  END IF;
  IF v_logo_path IS NOT NULL AND v_logo_path NOT LIKE p_tournament_id::text || '/%' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_LOGO_PATH');
  END IF;

  SELECT organization_id,
    jsonb_build_object(
      'name', name, 'venue', venue, 'start_date', start_date,
      'end_date', end_date, 'description', description,
      'logo_path', (SELECT logo_path FROM public.tournament_branding WHERE tournament_id = p_tournament_id)
    )
  INTO v_organization_id, v_before
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_FOUND');
  END IF;

  UPDATE public.tournaments
  SET name = v_name,
      venue = v_venue,
      start_date = p_start_date,
      end_date = p_end_date,
      description = v_description,
      updated_at = now()
  WHERE id = p_tournament_id;

  INSERT INTO public.tournament_branding (tournament_id, logo_path, updated_at)
  VALUES (p_tournament_id, v_logo_path, now())
  ON CONFLICT (tournament_id) DO UPDATE
  SET logo_path = EXCLUDED.logo_path, updated_at = now();

  INSERT INTO public.audit_logs (
    organization_id, tournament_id, user_id, action, entity_type,
    entity_id, before_json, after_json, reason
  ) VALUES (
    v_organization_id, p_tournament_id, v_actor,
    'TOURNAMENT_DETAILS_UPDATED', 'TOURNAMENT', p_tournament_id,
    v_before,
    jsonb_build_object(
      'name', v_name, 'venue', v_venue, 'start_date', p_start_date,
      'end_date', p_end_date, 'description', v_description, 'logo_path', v_logo_path
    ),
    'Tournament details updated'
  );

  RETURN jsonb_build_object('ok', true, 'code', 'DETAILS_UPDATED');
END;
$$;

REVOKE ALL ON FUNCTION public.update_tournament_details(uuid, text, text, date, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_tournament_details(uuid, text, text, date, date, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_tournament_details(uuid, text, text, date, date, text, text) TO authenticated;

--------------------------------------------------------------------------------
-- 5. NARROW DIRECT MEMBERSHIP MUTATION
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Organizers can manage tournament members" ON public.tournament_members;
REVOKE INSERT, UPDATE, DELETE ON public.tournament_members FROM anon, authenticated;

--------------------------------------------------------------------------------
-- 6. BRANDING AND TOURNAMENT LOGO POLICIES
--------------------------------------------------------------------------------

CREATE POLICY "Public can read public tournament branding"
ON public.tournament_branding FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = tournament_branding.tournament_id AND t.is_public = true
  )
);

CREATE POLICY "Members can read private tournament branding"
ON public.tournament_branding FOR SELECT
USING (public.is_tournament_member(tournament_id));

CREATE POLICY "Organizers can manage tournament branding"
ON public.tournament_branding FOR ALL
USING (public.is_tournament_organizer(tournament_id))
WITH CHECK (public.is_tournament_organizer(tournament_id));

CREATE POLICY "Organizers can upload tournament logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id::text = (storage.foldername(storage.objects.name))[1]
      AND public.is_tournament_organizer(t.id)
  )
);

CREATE POLICY "Organizers can update tournament logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id::text = (storage.foldername(storage.objects.name))[1]
      AND public.is_tournament_organizer(t.id)
  )
)
WITH CHECK (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id::text = (storage.foldername(storage.objects.name))[1]
      AND public.is_tournament_organizer(t.id)
  )
);

CREATE POLICY "Organizers can delete tournament logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id::text = (storage.foldername(storage.objects.name))[1]
      AND public.is_tournament_organizer(t.id)
  )
);
