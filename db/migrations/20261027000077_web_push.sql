-- v2: web push. Browsers register a Web Push subscription the same way phones register an Expo token, so the same
-- follows and the same alert queue serve both. The subscription endpoint is the device "token"; the keys travel with it.

ALTER TABLE public.push_tokens DROP CONSTRAINT IF EXISTS push_tokens_platform_check;
ALTER TABLE public.push_tokens ADD CONSTRAINT push_tokens_platform_check CHECK (platform IN ('ios', 'android', 'web'));
ALTER TABLE public.push_tokens ADD COLUMN p256dh text, ADD COLUMN auth_secret text;
ALTER TABLE public.push_tokens ADD CONSTRAINT push_tokens_web_keys CHECK (platform <> 'web' OR (p256dh IS NOT NULL AND auth_secret IS NOT NULL));

CREATE FUNCTION public.register_web_push(p_endpoint text, p_p256dh text, p_auth text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_endpoint IS NULL OR length(p_endpoint) > 1000 OR p_endpoint !~ '^https://[^\s]+$' THEN RAISE EXCEPTION 'Invalid push subscription'; END IF;
  IF p_p256dh IS NULL OR p_p256dh !~ '^[A-Za-z0-9_-]{80,100}$' OR p_auth IS NULL OR p_auth !~ '^[A-Za-z0-9_-]{20,30}$' THEN RAISE EXCEPTION 'Invalid push subscription keys'; END IF;
  INSERT INTO public.push_tokens (token, user_id, platform, p256dh, auth_secret)
  VALUES (p_endpoint, auth.uid(), 'web', p_p256dh, p_auth)
  ON CONFLICT (token) DO UPDATE
    SET user_id = COALESCE(auth.uid(), public.push_tokens.user_id), p256dh = EXCLUDED.p256dh, auth_secret = EXCLUDED.auth_secret, platform = 'web', updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.register_web_push(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_web_push(text, text, text) TO anon, authenticated;

-- Follow and unfollow already work on any registered token; allow the longer endpoint addresses there too.
CREATE OR REPLACE FUNCTION public.follow_target(p_token text, p_kind text, p_target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.push_tokens WHERE token = p_token) THEN RAISE EXCEPTION 'Unknown device'; END IF;
  IF p_kind NOT IN ('TEAM', 'MATCH', 'TOURNAMENT') THEN RAISE EXCEPTION 'Invalid kind'; END IF;
  IF p_kind = 'TEAM' THEN v_ok := EXISTS (SELECT 1 FROM public.teams WHERE id = p_target_id);
  ELSIF p_kind = 'MATCH' THEN v_ok := EXISTS (SELECT 1 FROM public.matches WHERE id = p_target_id);
  ELSE v_ok := EXISTS (SELECT 1 FROM public.tournaments WHERE id = p_target_id);
  END IF;
  IF NOT v_ok THEN RAISE EXCEPTION 'Nothing to follow'; END IF;
  IF (SELECT count(*) FROM public.push_follows WHERE token = p_token) >= 100 THEN RAISE EXCEPTION 'Too many follows'; END IF;
  INSERT INTO public.push_follows (token, kind, target_id) VALUES (p_token, p_kind, p_target_id) ON CONFLICT DO NOTHING;
END;
$$;
