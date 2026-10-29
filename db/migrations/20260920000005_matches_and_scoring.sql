-- 0005_matches_and_scoring.sql
-- Matches, live scoring, and standings

--------------------------------------------------------------------------------
-- 1. MATCHES
--------------------------------------------------------------------------------
CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.tournament_stages(id) ON DELETE SET NULL,
  match_number integer,
  home_team_id uuid NOT NULL REFERENCES public.teams(id),
  away_team_id uuid NOT NULL REFERENCES public.teams(id),
  scheduled_at timestamptz,
  venue text,
  court text,
  status text NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('SCHEDULED','LIVE','COMPLETED','POSTPONED','CANCELLED')),
  winner_team_id uuid REFERENCES public.teams(id),
  next_match_id uuid REFERENCES public.matches(id),
  next_match_slot text CHECK (next_match_slot IN ('HOME','AWAY')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (home_team_id <> away_team_id) -- A team cannot play itself
);

--------------------------------------------------------------------------------
-- 2. MATCH SCORERS
--------------------------------------------------------------------------------
CREATE TABLE public.match_scorers (
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by uuid NOT NULL REFERENCES public.profiles(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, user_id)
);

--------------------------------------------------------------------------------
-- 3. MATCH SETS
--------------------------------------------------------------------------------
CREATE TABLE public.match_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  set_number integer NOT NULL CHECK (set_number > 0),
  target_points integer NOT NULL CHECK (target_points > 0),
  home_score integer NOT NULL DEFAULT 0 CHECK (home_score >= 0),
  away_score integer NOT NULL DEFAULT 0 CHECK (away_score >= 0),
  winner_team_id uuid REFERENCES public.teams(id),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','LIVE','COMPLETED')),
  started_at timestamptz,
  completed_at timestamptz,
  UNIQUE (match_id, set_number)
);

--------------------------------------------------------------------------------
-- 4. SCORE EVENTS
--------------------------------------------------------------------------------
CREATE TABLE public.score_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  match_set_id uuid NOT NULL REFERENCES public.match_sets(id) ON DELETE CASCADE,
  sequence_number bigint NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('POINT','UNDO','CORRECTION')),
  team_id uuid REFERENCES public.teams(id),
  home_score_after integer NOT NULL CHECK (home_score_after >= 0),
  away_score_after integer NOT NULL CHECK (away_score_after >= 0),
  idempotency_key text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, sequence_number),
  UNIQUE (match_id, idempotency_key)
);

--------------------------------------------------------------------------------
-- 5. STANDINGS RULES
--------------------------------------------------------------------------------
CREATE TABLE public.standings_rules (
  stage_id uuid PRIMARY KEY REFERENCES public.tournament_stages(id) ON DELETE CASCADE,
  win_points integer NOT NULL DEFAULT 2,
  loss_points integer NOT NULL DEFAULT 0,
  walkover_points integer,
  tie_break_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

--------------------------------------------------------------------------------
-- 6. STANDINGS
--------------------------------------------------------------------------------
CREATE TABLE public.standings (
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.tournament_stages(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  played integer NOT NULL DEFAULT 0,
  won integer NOT NULL DEFAULT 0,
  lost integer NOT NULL DEFAULT 0,
  league_points integer NOT NULL DEFAULT 0,
  sets_won integer NOT NULL DEFAULT 0,
  sets_lost integer NOT NULL DEFAULT 0,
  points_for integer NOT NULL DEFAULT 0,
  points_against integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (stage_id, team_id)
);
