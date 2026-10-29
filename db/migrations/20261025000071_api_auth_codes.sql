-- v2: one-time codes for the password-recovery email link (PKCE). The email carries a random
-- code; exchanging it needs the verifier that only the browser which asked for the reset holds.
-- Stored hashed, single use, short lived. Only the API's database role touches this table.

CREATE TABLE public.api_auth_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  code_challenge text NOT NULL,
  code_challenge_method text NOT NULL CHECK (code_challenge_method IN ('s256', 'plain')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX api_auth_codes_user_idx ON public.api_auth_codes (user_id);

ALTER TABLE public.api_auth_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_auth_codes FROM PUBLIC, anon, authenticated;
