-- v2: people can download their data and delete their account (required by Google Play and the App Store).
-- Deleting removes the personal details and the ability to sign in, and withdraws open registrations. The rows that
-- tournaments, scores and payments point to stay (with the name replaced by "Deleted user" / "Former player"), because
-- other people's results and the organizers' financial records depend on them.

ALTER TABLE public.profiles DROP CONSTRAINT profiles_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED'));

--------------------------------------------------------------------------------
-- Download my data
--------------------------------------------------------------------------------
CREATE FUNCTION public.export_my_data()
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_tokens text[];
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  SELECT COALESCE(array_agg(token), '{}') INTO v_tokens FROM public.push_tokens WHERE user_id = v_me;
  RETURN jsonb_build_object(
    'exported_at', now(),
    'account', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = v_me),
    'player_profiles', (SELECT COALESCE(jsonb_agg(to_jsonb(pp)), '[]'::jsonb) FROM public.player_profiles pp WHERE pp.user_id = v_me),
    'player_registrations', (SELECT COALESCE(jsonb_agg(to_jsonb(r) || jsonb_build_object('tournament', t.name)), '[]'::jsonb)
      FROM public.player_tournament_registrations r JOIN public.player_profiles pp ON pp.id = r.player_id JOIN public.tournaments t ON t.id = r.tournament_id WHERE pp.user_id = v_me),
    'team_applications', (SELECT COALESCE(jsonb_agg(to_jsonb(a) || jsonb_build_object('tournament', t.name)), '[]'::jsonb)
      FROM public.team_owner_applications a JOIN public.tournaments t ON t.id = a.tournament_id WHERE a.user_id = v_me),
    'teams', (SELECT COALESCE(jsonb_agg(jsonb_build_object('team', tm.name, 'tournament', t.name, 'role', o.status)), '[]'::jsonb)
      FROM public.team_owners o JOIN public.teams tm ON tm.id = o.team_id JOIN public.tournaments t ON t.id = tm.tournament_id WHERE o.user_id = v_me),
    'tournament_roles', (SELECT COALESCE(jsonb_agg(jsonb_build_object('tournament', t.name, 'role', m.role, 'status', m.status)), '[]'::jsonb)
      FROM public.tournament_members m JOIN public.tournaments t ON t.id = m.tournament_id WHERE m.user_id = v_me),
    'payments', (SELECT COALESCE(jsonb_agg(jsonb_build_object('tournament', t.name, 'type', p.kind, 'amount', p.amount, 'status', p.status, 'method', p.provider,
        'reference', COALESCE(p.utr, p.provider_payment_id), 'paid_at', p.paid_at)), '[]'::jsonb)
      FROM public.registration_payments p JOIN public.tournaments t ON t.id = p.tournament_id WHERE p.payer_user_id = v_me),
    'follows', (SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', f.kind, 'target', f.target_id)), '[]'::jsonb) FROM public.push_follows f WHERE f.token = ANY (v_tokens)),
    'notification_devices', cardinality(v_tokens)
  );
END;
$$;

--------------------------------------------------------------------------------
-- Delete my account (run by the API, which also removes the person's uploaded files)
--------------------------------------------------------------------------------
CREATE FUNCTION public.delete_account_data(p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_running text;
BEGIN
  IF p_user IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user) THEN RAISE EXCEPTION 'Account not found'; END IF;

  -- Do not leave a running tournament without an organizer.
  SELECT string_agg(t.name, ', ') INTO v_running
  FROM public.tournament_members m JOIN public.tournaments t ON t.id = m.tournament_id
  WHERE m.user_id = p_user AND m.role = 'ORGANIZER' AND m.status = 'ACTIVE' AND t.status IN ('REGISTRATION', 'PREPARATION', 'LIVE')
    AND NOT EXISTS (SELECT 1 FROM public.tournament_members o WHERE o.tournament_id = m.tournament_id AND o.role = 'ORGANIZER' AND o.status = 'ACTIVE' AND o.user_id <> p_user);
  IF v_running IS NOT NULL THEN
    RAISE EXCEPTION 'You are the only organizer of % while it is still running. Add another organizer or finish or archive it first.', v_running USING ERRCODE = 'P0001';
  END IF;

  -- Open registrations are withdrawn (a decided one keeps its history).
  UPDATE public.player_tournament_registrations r SET status = 'WITHDRAWN', updated_at = now()
  FROM public.player_profiles pp WHERE pp.id = r.player_id AND pp.user_id = p_user AND r.status IN ('PENDING', 'CHANGES_REQUESTED');
  UPDATE public.team_owner_applications SET status = 'WITHDRAWN', updated_at = now(), phone = NULL, email = NULL, place = NULL
  WHERE user_id = p_user AND status IN ('PENDING', 'CHANGES_REQUESTED');
  UPDATE public.team_owner_applications SET phone = NULL, email = NULL WHERE user_id = p_user;

  -- Personal details out of the player profile; the row stays for results that mention the player.
  UPDATE public.player_profiles SET user_id = NULL, display_name = 'Former player', photo_path = NULL, date_of_birth = NULL, phone = NULL, place = NULL,
    height_cm = NULL, playing_history = NULL, jersey_name = NULL, jersey_number = NULL, jersey_size = NULL, updated_at = now()
  WHERE user_id = p_user;
  UPDATE public.team_profiles SET owner_user_id = NULL WHERE owner_user_id = p_user;

  -- Access, devices, alerts, sessions.
  DELETE FROM public.team_owners WHERE user_id = p_user;
  DELETE FROM public.tournament_members WHERE user_id = p_user;
  DELETE FROM public.organization_members WHERE user_id = p_user;
  DELETE FROM public.match_scorers WHERE user_id = p_user;
  DELETE FROM public.platform_super_admins WHERE user_id = p_user;
  DELETE FROM public.push_follows WHERE token IN (SELECT token FROM public.push_tokens WHERE user_id = p_user);
  DELETE FROM public.push_tokens WHERE user_id = p_user;
  DELETE FROM public.notifications WHERE user_id = p_user;
  DELETE FROM public.api_refresh_tokens WHERE user_id = p_user;
  DELETE FROM public.api_auth_codes WHERE user_id = p_user;

  -- Payment records stay (the organizer's accounts need them); the screenshot is removed.
  UPDATE public.registration_payments SET proof_image = NULL, proof_type = NULL, updated_at = now() WHERE payer_user_id = p_user;

  UPDATE public.profiles SET full_name = 'Deleted user', phone = NULL, email = NULL, avatar_path = NULL, status = 'DELETED', updated_at = now() WHERE id = p_user;
  UPDATE auth.users SET email = 'deleted-' || id::text || '@deleted.invalid', phone = NULL, encrypted_password = '', raw_user_meta_data = '{}'::jsonb,
    banned_until = 'infinity', deleted_at = now() WHERE id = p_user;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_account_data(uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.export_my_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_my_data() TO authenticated;
