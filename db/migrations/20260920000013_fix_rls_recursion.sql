-- 20260920000013_fix_rls_recursion.sql
-- Fix infinite recursion in player_profiles and player_tournament_registrations

-- 1. Create a security definer helper to check if an organizer manages a tournament where the player is registered
CREATE OR REPLACE FUNCTION public.is_player_registered_in_organizer_tournament(p_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM player_tournament_registrations ptr 
    JOIN tournaments t ON t.id = ptr.tournament_id 
    WHERE ptr.player_id = p_id AND is_tournament_organizer(t.id)
  );
$$;

-- 2. Update the policy on player_profiles
DROP POLICY IF EXISTS "Organizers can read all players" ON public.player_profiles;
CREATE POLICY "Organizers can read all players" ON public.player_profiles FOR SELECT USING (
  public.is_player_registered_in_organizer_tournament(id)
);
