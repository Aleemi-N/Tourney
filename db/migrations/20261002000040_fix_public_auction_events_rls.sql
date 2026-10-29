-- Fix RLS policy on auction_public_events so public spectators and team owners can view live auction stream events
GRANT SELECT ON public.auction_public_events TO anon, authenticated;

ALTER TABLE public.auction_public_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auction_public_events_public_select" ON public.auction_public_events;
CREATE POLICY "auction_public_events_public_select" ON public.auction_public_events
    FOR SELECT TO anon, authenticated USING (true);
