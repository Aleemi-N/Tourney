-- 20261002000038_fix_auction_categories_rls.sql
-- Fixes RLS policies and function execution permissions for tournament_auction_categories.

GRANT EXECUTE ON FUNCTION public.is_tournament_member(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_tournament_organizer(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_team_owner(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_organization_admin(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_assigned_scorer(uuid) TO anon, authenticated, service_role;

ALTER TABLE public.tournament_auction_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tournament members can read auction categories" ON public.tournament_auction_categories;
DROP POLICY IF EXISTS "tournament_auction_categories_select_policy" ON public.tournament_auction_categories;
DROP POLICY IF EXISTS "tournament_auction_categories_organizer_policy" ON public.tournament_auction_categories;

CREATE POLICY "tournament_auction_categories_select_policy"
  ON public.tournament_auction_categories
  FOR SELECT
  USING (
    public.is_tournament_member(tournament_id)
    OR EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_id AND t.is_public = true
    )
    OR public.is_platform_super_admin()
  );

CREATE POLICY "tournament_auction_categories_organizer_policy"
  ON public.tournament_auction_categories
  FOR ALL
  USING (
    public.is_tournament_organizer(tournament_id)
    OR public.is_platform_super_admin()
  );
