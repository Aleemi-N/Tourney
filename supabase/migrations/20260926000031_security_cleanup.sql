DROP VIEW IF EXISTS public.public_revealed_lot_state;
DROP POLICY IF EXISTS "Public can read score events" ON public.score_events;