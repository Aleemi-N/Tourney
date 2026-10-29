-- v2: rate limits for sign-in, sign-up and password recovery live in the database, so a restart of the API does not
-- forget them. One row per event; the key is hashed (no email addresses or IPs are stored); old rows are pruned by the API.
CREATE TABLE public.api_rate_events (
  id bigserial PRIMARY KEY,
  bucket text NOT NULL,
  key_hash text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX api_rate_events_lookup_idx ON public.api_rate_events (bucket, key_hash, at DESC);
CREATE INDEX api_rate_events_at_idx ON public.api_rate_events (at);
ALTER TABLE public.api_rate_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_rate_events FROM PUBLIC, anon, authenticated;
