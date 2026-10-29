-- v2 hardening: clients no longer write tables directly. Every change goes through a
-- SECURITY DEFINER function that checks who is asking, so a user cannot edit their own
-- approval, suspension or role rows through the REST endpoint (the Supabase default
-- grants every role write access and relies on row policies alone).
--
-- The only direct writes the apps still make are re-granted at column level below.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Tables created later must not hand out writes either.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon, authenticated;

-- Organizer reorders the auction queue (ConfigureQueueModal); row policies still limit it to organizers.
GRANT UPDATE (auction_order) ON public.auction_players TO authenticated;

-- Organizer moves a tournament between draft, preparation and registration (app/actions/tournament.ts).
GRANT UPDATE (status, is_public) ON public.tournaments TO authenticated;
