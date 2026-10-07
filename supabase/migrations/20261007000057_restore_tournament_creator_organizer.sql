-- 20260930000036 dropped the tournament-creator branch, locking creators out of
-- organizer-only reads/RPCs (e.g. match_order_scopes, reorder_matches).
CREATE OR REPLACE FUNCTION public.is_tournament_organizer(tourn_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.tournaments t
    WHERE t.id = tourn_id
      AND (
        t.created_by = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.tournament_members tm
          WHERE tm.tournament_id = t.id
            AND tm.user_id = (SELECT auth.uid())
            AND tm.role = 'ORGANIZER'
            AND tm.status = 'ACTIVE'
        )
      )
  );
$$;
