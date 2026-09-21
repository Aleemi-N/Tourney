-- 20260920000018_fix_team_owner_application_rls.sql
-- Fix missing SELECT policies for team_owner_applications

-- 1. Applicant can SELECT their own applications
CREATE POLICY "Users can read own applications" ON public.team_owner_applications 
FOR SELECT USING (user_id = auth.uid());

-- 2. Organizer can SELECT applications for their tournaments
CREATE POLICY "Organizers can read applications" ON public.team_owner_applications 
FOR SELECT USING (is_tournament_organizer(tournament_id));
