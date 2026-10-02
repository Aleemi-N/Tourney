-- Add RLS policies for tournament_stages table
-- RLS was enabled but no policies existed, blocking all reads

-- Organizers and members can read stages for their tournaments
DROP POLICY IF EXISTS "tournament_stages_select" ON public.tournament_stages;
CREATE POLICY "tournament_stages_select"
  ON public.tournament_stages
  FOR SELECT
  USING (
    tournament_id IN (
      SELECT tournament_id FROM public.tournament_members WHERE user_id = auth.uid()
    )
    OR
    tournament_id IN (
      SELECT id FROM public.tournaments WHERE is_public = true
    )
  );

-- Only organizers can insert/update/delete stages (handled via RPC, but allow direct for service role)
DROP POLICY IF EXISTS "tournament_stages_organizer_write" ON public.tournament_stages;
CREATE POLICY "tournament_stages_organizer_write"
  ON public.tournament_stages
  FOR ALL
  USING (
    tournament_id IN (
      SELECT tournament_id FROM public.tournament_members 
      WHERE user_id = auth.uid() AND role = 'ORGANIZER'
    )
  )
  WITH CHECK (
    tournament_id IN (
      SELECT tournament_id FROM public.tournament_members 
      WHERE user_id = auth.uid() AND role = 'ORGANIZER'
    )
  );
