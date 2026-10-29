-- 0002_players_and_registrations.sql
-- Player profiles, registrations, and team roster (team_players)

--------------------------------------------------------------------------------
-- 1. PLAYER PROFILES
--------------------------------------------------------------------------------
CREATE TABLE public.player_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  photo_path text,
  date_of_birth date,
  phone text,
  place text,
  height_cm numeric(5,2),
  primary_position text NOT NULL
    CHECK (primary_position IN (
      'SETTER','LIBERO','MIDDLE_BLOCKER',
      'OUTSIDE_HITTER','OPPOSITE','UNIVERSAL'
    )),
  secondary_position text
    CHECK (
      secondary_position IS NULL OR secondary_position IN (
        'SETTER','LIBERO','MIDDLE_BLOCKER',
        'OUTSIDE_HITTER','OPPOSITE','UNIVERSAL'
      )
    ),
  playing_history text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

--------------------------------------------------------------------------------
-- 2. PLAYER TOURNAMENT REGISTRATIONS
--------------------------------------------------------------------------------
CREATE TABLE public.player_tournament_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.player_profiles(id) ON DELETE CASCADE,
  registration_number text,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','REJECTED','CHANGES_REQUESTED','WITHDRAWN')),
  auction_category text
    CHECK (auction_category IN ('ICON_LOT','SETTER_LOT','MAIN_AUCTION')),
  review_notes text,
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, player_id)
);

--------------------------------------------------------------------------------
-- 3. TEAM PLAYERS (ROSTER)
--------------------------------------------------------------------------------
CREATE TABLE public.team_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.player_profiles(id),
  acquisition_type text NOT NULL
    CHECK (acquisition_type IN ('REGISTERED','ICON_LOT','SETTER_LOT','AUCTION','MANUAL')),
  acquisition_amount numeric(12,2),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','RELEASED','DISQUALIFIED')),
  joined_at timestamptz NOT NULL DEFAULT now()
);

-- Recommended invariant: A player can only be active in one team per tournament
CREATE UNIQUE INDEX team_players_one_active_team_per_tournament
ON public.team_players (tournament_id, player_id)
WHERE status = 'ACTIVE';
