-- v2: refresh tokens issued by the Spring Boot API (opaque, stored hashed, rotated on use).
-- Only the API's database role touches this table; clients never see it through PostgREST.

CREATE TABLE public.api_refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX api_refresh_tokens_user_idx ON public.api_refresh_tokens (user_id);

ALTER TABLE public.api_refresh_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_refresh_tokens FROM PUBLIC, anon, authenticated;
