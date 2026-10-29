-- v2: suspending or deleting an account ends its sessions at once: its refresh tokens can no longer be renewed, so the
-- access token it already holds (15 minutes) is the longest it can still be used.
CREATE OR REPLACE FUNCTION public.end_sessions_of_blocked_account() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.api_refresh_tokens SET revoked_at = now() - interval '1 hour' WHERE user_id = NEW.id AND revoked_at IS NULL;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.end_sessions_of_blocked_account() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS end_sessions_when_blocked ON public.profiles;
CREATE TRIGGER end_sessions_when_blocked AFTER UPDATE OF status ON public.profiles
  FOR EACH ROW WHEN (NEW.status IN ('SUSPENDED', 'DELETED') AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.end_sessions_of_blocked_account();
