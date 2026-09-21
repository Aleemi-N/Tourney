-- 20260920000016_fix_tournament_creation.sql
-- Atomic tournament creation and update RPCs.
--
-- PROBLEM (Phase 3 QA finding):
--   The tournament wizard used direct table writes that could not satisfy RLS
--   bootstrap requirements:
--
--   (a) volleyball_rules — RLS ENABLED but ZERO policies defined. All direct
--       INSERT/UPDATE/DELETE blocked for non-superusers.
--
--   (b) tournament_settings INSERT — policy "Organizers can manage settings"
--       uses is_tournament_organizer(tournament_id), which requires a
--       tournament_members row with role ORGANIZER to already exist.
--       Bootstrap chicken-and-egg: no members exist at the moment of INSERT.
--
--   (c) tournament UPDATE — same is_tournament_organizer chicken-and-egg.
--       After creation there were no tournament_members rows so subsequent
--       step-saves also failed.
--
-- SOLUTION: Two SECURITY DEFINER RPCs:
--   1. create_tournament_draft    — atomic 4-table insert (tournament +
--      tournament_members + tournament_settings + volleyball_rules)
--   2. update_tournament_draft    — transactional update for all three mutable
--      tables, gated on is_tournament_organizer (which now works because the
--      organizer was added by create_tournament_draft)
--
-- SECURITY MODEL (same principles as migration 0015):
--   • created_by / organization_id / sport derived server-side from auth.uid()
--     and trusted membership data — never supplied by the client
--   • org role verified inside the function before any write
--   • sport forced to VOLLEYBALL unconditionally in V1
--   • status forced to DRAFT unconditionally on create
--   • organization_id / created_by / sport cannot be changed via update
--   • EXECUTE granted to anon + authenticated; anonymous calls rejected
--     inside the function by the auth.uid() IS NULL guard
--
-- IDEMPOTENCY STRATEGY (create):
--   The tournaments table has UNIQUE (organization_id, slug).
--   If a network retry causes a duplicate call with the same org+slug, the
--   function returns the existing tournament ID rather than raising an error.
--   This is safe because:
--     • organization_id is derived server-side (cannot be forged)
--     • the caller cannot pick another org's slug space
--   A different slug = intentionally a new tournament.
--
-- MIGRATIONS NOT MODIFIED: 00001–00015

--------------------------------------------------------------------------------
-- 1. volleyball_rules SELECT policies
--    (INSERT/UPDATE/DELETE remain RPC-only; no direct client access)
--------------------------------------------------------------------------------
-- Public read for public tournaments
CREATE POLICY "Public can read public volleyball rules" ON public.volleyball_rules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = volleyball_rules.tournament_id
        AND t.is_public = true
    )
  );

-- Members read for private tournaments
CREATE POLICY "Members can read volleyball rules" ON public.volleyball_rules
  FOR SELECT USING (
    public.is_tournament_member(tournament_id)
  );

-- Organizers read all (including stage-specific rules)
CREATE POLICY "Organizers can read volleyball rules" ON public.volleyball_rules
  FOR SELECT USING (
    public.is_tournament_organizer(tournament_id)
  );

-- No direct INSERT/UPDATE/DELETE policies — all mutations via RPC.

--------------------------------------------------------------------------------
-- 2. RPC: create_tournament_draft
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_tournament_draft(
  p_name         text,
  p_slug         text,
  p_description  text    DEFAULT NULL,
  p_format       text    DEFAULT 'KNOCKOUT',
  p_league_mode  text    DEFAULT NULL,
  p_settings     jsonb   DEFAULT NULL,
  p_vball_rules  jsonb   DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid;
  v_org_id       uuid;
  v_org_role     text;
  v_tournament_id uuid;
BEGIN
  -- ── Auth guard ─────────────────────────────────────────────────────────────
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'PT401';
  END IF;

  -- ── Input validation ───────────────────────────────────────────────────────
  IF trim(p_name) = '' THEN
    RAISE EXCEPTION 'Tournament name is required' USING ERRCODE = 'PT400';
  END IF;
  IF trim(p_slug) = '' THEN
    RAISE EXCEPTION 'Tournament slug is required' USING ERRCODE = 'PT400';
  END IF;
  -- Slug: lowercase letters, numbers, hyphens
  IF p_slug !~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' AND p_slug !~ '^[a-z0-9]$' THEN
    RAISE EXCEPTION 'slug must contain only lowercase letters, numbers, and hyphens' USING ERRCODE = 'PT400';
  END IF;
  -- Validate format values
  IF p_format NOT IN ('KNOCKOUT', 'LEAGUE') THEN
    RAISE EXCEPTION 'format must be KNOCKOUT or LEAGUE' USING ERRCODE = 'PT400';
  END IF;
  -- Validate format / league_mode consistency
  IF p_format = 'LEAGUE' AND p_league_mode IS NULL THEN
    RAISE EXCEPTION 'league_mode is required for LEAGUE format' USING ERRCODE = 'PT400';
  END IF;
  IF p_format = 'KNOCKOUT' AND p_league_mode IS NOT NULL THEN
    RAISE EXCEPTION 'league_mode must be NULL for KNOCKOUT format' USING ERRCODE = 'PT400';
  END IF;
  IF p_league_mode IS NOT NULL AND p_league_mode NOT IN ('AUCTION', 'REGISTERED_TEAM') THEN
    RAISE EXCEPTION 'league_mode must be AUCTION or REGISTERED_TEAM' USING ERRCODE = 'PT400';
  END IF;

  -- ── Resolve organization from authenticated membership ────────────────────
  -- The caller must be an OWNER or ADMIN of an active organization.
  -- We resolve the org server-side — the client never supplies an org_id.
  SELECT om.organization_id, om.role
  INTO v_org_id, v_org_role
  FROM public.organization_members om
  WHERE om.user_id = v_user_id
    AND om.role IN ('OWNER', 'ADMIN')
    AND om.status = 'ACTIVE'
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active organization with appropriate authority found for this user'
      USING ERRCODE = 'PT403';
  END IF;

  -- ── Idempotency: return existing if same (org, slug) ─────────────────────
  SELECT id INTO v_tournament_id
  FROM public.tournaments
  WHERE organization_id = v_org_id
    AND slug = p_slug
  LIMIT 1;

  IF v_tournament_id IS NOT NULL THEN
    -- Tournament with this org+slug already exists; return it (safe retry).
    RETURN json_build_object(
      'tournament_id',   v_tournament_id,
      'organization_id', v_org_id,
      'idempotent',      true
    );
  END IF;

  -- ── Step 1: Create tournament ──────────────────────────────────────────────
  -- sport is ALWAYS 'VOLLEYBALL' — never from client
  -- status is ALWAYS 'DRAFT' — never from client
  -- created_by is ALWAYS v_user_id — never from client
  -- organization_id is ALWAYS v_org_id — never from client
  INSERT INTO public.tournaments (
    organization_id,
    name,
    slug,
    description,
    sport,
    format,
    league_mode,
    status,
    is_public,
    created_by
  )
  VALUES (
    v_org_id,
    p_name,
    p_slug,
    p_description,
    'VOLLEYBALL',
    p_format,
    p_league_mode,
    'DRAFT',
    false,
    v_user_id
  )
  RETURNING id INTO v_tournament_id;

  -- ── Step 2: Add caller as tournament ORGANIZER ────────────────────────────
  -- role hardcoded to ORGANIZER — never from client
  INSERT INTO public.tournament_members (tournament_id, user_id, role)
  VALUES (v_tournament_id, v_user_id, 'ORGANIZER')
  ON CONFLICT (tournament_id, user_id, role) DO NOTHING;

  -- ── Step 3: Create tournament_settings ────────────────────────────────────
  INSERT INTO public.tournament_settings (
    tournament_id,
    max_teams,
    min_squad_size,
    max_squad_size,
    player_registration_enabled,
    owner_registration_mode,
    public_live_enabled,
    timezone
  )
  VALUES (
    v_tournament_id,
    (p_settings->>'max_teams')::integer,
    COALESCE((p_settings->>'min_squad_size')::integer, 1),
    (p_settings->>'max_squad_size')::integer,
    COALESCE((p_settings->>'player_registration_enabled')::boolean, true),
    COALESCE(p_settings->>'owner_registration_mode', 'OPEN'),
    COALESCE((p_settings->>'public_live_enabled')::boolean, true),
    COALESCE(p_settings->>'timezone', 'Asia/Kolkata')
  )
  ON CONFLICT (tournament_id) DO NOTHING;

  -- ── Step 4: Create volleyball_rules ───────────────────────────────────────
  INSERT INTO public.volleyball_rules (
    tournament_id,
    stage_id,
    sets_to_win,
    win_by_two
  )
  VALUES (
    v_tournament_id,
    NULL,
    COALESCE((p_vball_rules->>'sets_to_win')::integer, 2),
    COALESCE((p_vball_rules->>'win_by_two')::boolean, true)
  );

  RETURN json_build_object(
    'tournament_id',   v_tournament_id,
    'organization_id', v_org_id,
    'idempotent',      false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_tournament_draft(text, text, text, text, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_tournament_draft(text, text, text, text, text, jsonb, jsonb) TO anon, authenticated;

--------------------------------------------------------------------------------
-- 3. RPC: update_tournament_draft
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_tournament_draft(
  p_tournament_id uuid,
  p_name          text    DEFAULT NULL,
  p_slug          text    DEFAULT NULL,
  p_description   text    DEFAULT NULL,
  p_format        text    DEFAULT NULL,
  p_league_mode   text    DEFAULT NULL,
  p_settings      jsonb   DEFAULT NULL,
  p_vball_rules   jsonb   DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid;
  v_current    public.tournaments%ROWTYPE;
  v_new_format text;
  v_new_league text;
BEGIN
  -- ── Auth guard ─────────────────────────────────────────────────────────────
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'PT401';
  END IF;

  -- ── Load and lock tournament ───────────────────────────────────────────────
  SELECT * INTO v_current
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'PT404';
  END IF;

  -- ── Authorization: caller must be a tournament ORGANIZER ──────────────────
  IF NOT public.is_tournament_organizer(p_tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized: not a tournament organizer' USING ERRCODE = 'PT403';
  END IF;

  -- ── State check: only DRAFT tournaments may be edited via this RPC ─────────
  IF v_current.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Tournament is not in DRAFT status (current: %)', v_current.status
      USING ERRCODE = 'PT409';
  END IF;

  -- ── Immutable fields enforcement ───────────────────────────────────────────
  -- sport: always VOLLEYBALL in V1 — cannot be changed
  -- organization_id: cannot be transferred
  -- created_by: cannot be changed

  -- ── Resolve updated format / league_mode ──────────────────────────────────
  v_new_format := COALESCE(p_format, v_current.format);
  v_new_league := COALESCE(p_league_mode, v_current.league_mode);

  -- Validate
  IF v_new_format NOT IN ('KNOCKOUT', 'LEAGUE') THEN
    RAISE EXCEPTION 'format must be KNOCKOUT or LEAGUE' USING ERRCODE = 'PT400';
  END IF;
  IF v_new_format = 'LEAGUE' AND v_new_league IS NULL THEN
    RAISE EXCEPTION 'league_mode is required for LEAGUE format' USING ERRCODE = 'PT400';
  END IF;
  IF v_new_format = 'KNOCKOUT' AND v_new_league IS NOT NULL THEN
    RAISE EXCEPTION 'league_mode must be NULL for KNOCKOUT format' USING ERRCODE = 'PT400';
  END IF;
  IF v_new_league IS NOT NULL AND v_new_league NOT IN ('AUCTION', 'REGISTERED_TEAM') THEN
    RAISE EXCEPTION 'league_mode must be AUCTION or REGISTERED_TEAM' USING ERRCODE = 'PT400';
  END IF;

  -- ── Update tournament row ──────────────────────────────────────────────────
  UPDATE public.tournaments SET
    name          = COALESCE(p_name,        v_current.name),
    slug          = COALESCE(p_slug,        v_current.slug),
    description   = COALESCE(p_description, v_current.description),
    format        = v_new_format,
    league_mode   = v_new_league,
    updated_at    = now()
    -- sport, organization_id, created_by, status intentionally NOT updated here
  WHERE id = p_tournament_id;

  -- ── Update tournament_settings (upsert) ────────────────────────────────────
  IF p_settings IS NOT NULL THEN
    INSERT INTO public.tournament_settings (
      tournament_id,
      max_teams,
      min_squad_size,
      max_squad_size,
      player_registration_enabled,
      owner_registration_mode,
      public_live_enabled,
      timezone,
      updated_at
    )
    VALUES (
      p_tournament_id,
      (p_settings->>'max_teams')::integer,
      COALESCE((p_settings->>'min_squad_size')::integer, 1),
      (p_settings->>'max_squad_size')::integer,
      COALESCE((p_settings->>'player_registration_enabled')::boolean, true),
      COALESCE(p_settings->>'owner_registration_mode', 'OPEN'),
      COALESCE((p_settings->>'public_live_enabled')::boolean, true),
      COALESCE(p_settings->>'timezone', 'Asia/Kolkata'),
      now()
    )
    ON CONFLICT (tournament_id) DO UPDATE SET
      max_teams                    = EXCLUDED.max_teams,
      min_squad_size               = EXCLUDED.min_squad_size,
      max_squad_size               = EXCLUDED.max_squad_size,
      player_registration_enabled  = EXCLUDED.player_registration_enabled,
      owner_registration_mode      = EXCLUDED.owner_registration_mode,
      public_live_enabled          = EXCLUDED.public_live_enabled,
      timezone                     = EXCLUDED.timezone,
      updated_at                   = now();
  END IF;

  -- ── Update volleyball_rules (upsert on tournament-level rule) ─────────────
  IF p_vball_rules IS NOT NULL THEN
    INSERT INTO public.volleyball_rules (
      tournament_id,
      stage_id,
      sets_to_win,
      win_by_two
    )
    VALUES (
      p_tournament_id,
      NULL,
      COALESCE((p_vball_rules->>'sets_to_win')::integer, 2),
      COALESCE((p_vball_rules->>'win_by_two')::boolean, true)
    )
    ON CONFLICT DO NOTHING;
    -- If a row already exists (stage_id IS NULL), update it
    UPDATE public.volleyball_rules SET
      sets_to_win = COALESCE((p_vball_rules->>'sets_to_win')::integer, sets_to_win),
      win_by_two  = COALESCE((p_vball_rules->>'win_by_two')::boolean, win_by_two),
      updated_at  = now()
    WHERE tournament_id = p_tournament_id
      AND stage_id IS NULL;
  END IF;

  RETURN json_build_object(
    'tournament_id', p_tournament_id,
    'success',       true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_tournament_draft(uuid, text, text, text, text, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_tournament_draft(uuid, text, text, text, text, text, jsonb, jsonb) TO anon, authenticated;

--------------------------------------------------------------------------------
-- 4. Add tournament_members INSERT policy for tournament organizer bootstrap
--    (needed so the RPC-created ORGANIZER membership can be read by the
--     organizer in subsequent SELECT queries that go through is_tournament_organizer)
--------------------------------------------------------------------------------
-- Note: The tournament_members INSERT in step 2 of create_tournament_draft
-- runs under SECURITY DEFINER, so no INSERT policy is needed for the RPC
-- path. The existing "Organizers can manage tournament members" ALL policy
-- covers subsequent updates. No change to existing policies needed.

-- However, is_tournament_organizer queries tournament_members directly
-- (it is itself SECURITY DEFINER, so RLS is bypassed inside it).
-- The SELECT policy for non-SECURITY-DEFINER contexts:
--   "Members can read tournament members" uses is_tournament_member()
--   which also bypasses RLS inside the function.
-- So existing policies are sufficient.

-- ── Reminder: no migrations 00001–00015 were modified ───────────────────────
