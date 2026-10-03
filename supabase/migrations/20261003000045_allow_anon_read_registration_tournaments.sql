-- 20261003000045_allow_anon_read_registration_tournaments.sql
--
-- Problem: The player registration page at /t/[slug]/register/player shows
-- "Tournament not found" for anonymous (not signed-in) users, even when the
-- tournament is in REGISTRATION status, because the RLS policy only allows
-- SELECT on tournaments where is_public = true.
--
-- Fix:
--   1. Extend the tournaments SELECT policy to also allow reading tournaments
--      whose status = 'REGISTRATION'. Safe because the registration page still
--      enforces auth server-side -- anonymous users are only prompted to sign in.
--   2. Fix the edava-volleyball-league production row: set is_public=true,
--      status=REGISTRATION so it is immediately visible.

--------------------------------------------------------------------------------
-- 1. Drop and re-create the tournaments SELECT policy
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS "tournaments_select_policy" ON public.tournaments;

CREATE POLICY "tournaments_select_policy" ON public.tournaments
  FOR SELECT USING (
    -- Publicly launched tournaments
    is_public = true
    -- Tournaments open for registration are readable by anyone so the
    -- registration page can render and prompt users to sign in / sign up.
    OR status = 'REGISTRATION'
    -- Members of a tournament can always read it
    OR public.is_tournament_member(id)
    -- Super admins can read everything
    OR public.is_platform_super_admin()
  );

--------------------------------------------------------------------------------
-- 2. Fix edava-volleyball-league production data (idempotent)
--------------------------------------------------------------------------------

UPDATE public.tournaments
SET
  is_public = true,
  status    = 'REGISTRATION'
WHERE
  slug = 'edava-volleyball-league'
  AND (is_public = false OR status != 'REGISTRATION');

-- Audit log (using correct column names: entity_type, entity_id, after_json)
DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.tournaments WHERE slug = 'edava-volleyball-league';
  IF v_id IS NOT NULL THEN
    INSERT INTO public.audit_logs(tournament_id, action, entity_type, entity_id, after_json)
    VALUES (
      v_id,
      'TOURNAMENT_DATA_FIX',
      'tournaments',
      v_id,
      jsonb_build_object(
        'migration', '20261003000045',
        'is_public', true,
        'status', 'REGISTRATION',
        'reason', 'Production fix: set is_public=true and status=REGISTRATION so anonymous users reach the player registration page'
      )
    );
  END IF;
END $$;
