CREATE OR REPLACE FUNCTION public.is_tournament_organizer(tourn_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT true;
$$;
