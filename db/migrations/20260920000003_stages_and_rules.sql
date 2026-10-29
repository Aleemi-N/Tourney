-- 0003_stages_and_rules.sql
-- Tournament stages and volleyball-specific rules

--------------------------------------------------------------------------------
-- 1. TOURNAMENT STAGES
--------------------------------------------------------------------------------
CREATE TABLE public.tournament_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name text NOT NULL,
  stage_type text NOT NULL CHECK (stage_type IN ('LEAGUE','KNOCKOUT')),
  sequence integer NOT NULL CHECK (sequence > 0),
  qualification_count integer,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','ACTIVE','COMPLETED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, sequence)
);

--------------------------------------------------------------------------------
-- 2. VOLLEYBALL RULES
--------------------------------------------------------------------------------
CREATE TABLE public.volleyball_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.tournament_stages(id) ON DELETE CASCADE,
  sets_to_win integer NOT NULL CHECK (sets_to_win > 0),
  win_by_two boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

--------------------------------------------------------------------------------
-- 3. VOLLEYBALL SET RULES
--------------------------------------------------------------------------------
CREATE TABLE public.volleyball_set_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  volleyball_rule_id uuid NOT NULL REFERENCES public.volleyball_rules(id) ON DELETE CASCADE,
  set_number integer NOT NULL CHECK (set_number > 0),
  target_points integer NOT NULL CHECK (target_points > 0),
  UNIQUE (volleyball_rule_id, set_number)
);
