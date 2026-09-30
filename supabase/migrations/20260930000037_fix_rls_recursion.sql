-- 20260930000037_fix_rls_recursion.sql
-- Fixes infinite recursion in RLS policies introduced in the previous migration.
-- player_profiles and player_tournament_registrations previously queried each other in their USING clauses.

--------------------------------------------------------------------------------
-- 1. DROP RECURSIVE POLICIES
--------------------------------------------------------------------------------

DROP POLICY IF EXISTS "player_profiles_select_policy" ON public.player_profiles;
DROP POLICY IF EXISTS "player_tournament_registrations_select_policy" ON public.player_tournament_registrations;

--------------------------------------------------------------------------------
-- 2. CREATE SECURITY DEFINER HELPER FUNCTIONS TO BYPASS RLS
--------------------------------------------------------------------------------

-- Helper to check if a user owns a profile without triggering player_profiles RLS
CREATE OR REPLACE FUNCTION public.is_own_registration(p_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM player_profiles
    WHERE id = p_id AND user_id = (SELECT auth.uid())
  );
$$;

-- Helper to check if a user can view a profile without triggering registration RLS
CREATE OR REPLACE FUNCTION public.can_view_player_profile(p_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM player_tournament_registrations r
    JOIN tournaments t ON t.id = r.tournament_id
    WHERE r.player_id = p_id
      AND (
        t.is_public = true
        OR EXISTS (
          SELECT 1 FROM tournament_members tm
          WHERE tm.tournament_id = r.tournament_id
            AND tm.user_id = (SELECT auth.uid())
            AND tm.status = 'ACTIVE'
        )
      )
  );
$$;

--------------------------------------------------------------------------------
-- 3. RECREATE NON-RECURSIVE POLICIES
--------------------------------------------------------------------------------

-- Table: public.player_profiles
CREATE POLICY "player_profiles_select_policy" ON public.player_profiles
  FOR SELECT USING (
    user_id = (SELECT auth.uid())
    OR public.is_platform_super_admin()
    OR public.can_view_player_profile(id)
  );

-- Table: public.player_tournament_registrations
CREATE POLICY "player_tournament_registrations_select_policy" ON public.player_tournament_registrations
  FOR SELECT USING (
    public.is_own_registration(player_id)
    OR public.is_tournament_member(tournament_id)
    OR public.is_platform_super_admin()
  );
