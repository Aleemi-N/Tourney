-- 0001_core_schema.sql
-- Base schema: Profiles, Organizations, Tournaments, Teams, and Memberships

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

--------------------------------------------------------------------------------
-- 1. PROFILES
--------------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  email text,
  avatar_path text,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','SUSPENDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

--------------------------------------------------------------------------------
-- 2. ORGANIZATIONS
--------------------------------------------------------------------------------
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_path text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

--------------------------------------------------------------------------------
-- 3. ORGANIZATION MEMBERS
--------------------------------------------------------------------------------
CREATE TABLE public.organization_members (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('OWNER','ADMIN','STAFF')),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

--------------------------------------------------------------------------------
-- 4. TOURNAMENTS
--------------------------------------------------------------------------------
CREATE TABLE public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  sport text NOT NULL DEFAULT 'VOLLEYBALL'
    CHECK (sport = 'VOLLEYBALL'),
  format text NOT NULL
    CHECK (format IN ('LEAGUE','KNOCKOUT')),
  league_mode text
    CHECK (league_mode IN ('AUCTION','REGISTERED_TEAM')),
  venue text,
  description text,
  start_date date,
  end_date date,
  registration_start timestamptz,
  registration_end timestamptz,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','REGISTRATION','PREPARATION','LIVE','COMPLETED','ARCHIVED')),
  is_public boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug),
  CHECK (
    (format = 'LEAGUE' AND league_mode IS NOT NULL)
    OR
    (format = 'KNOCKOUT' AND league_mode IS NULL)
  )
);

--------------------------------------------------------------------------------
-- 5. TOURNAMENT SETTINGS
--------------------------------------------------------------------------------
CREATE TABLE public.tournament_settings (
  tournament_id uuid PRIMARY KEY REFERENCES public.tournaments(id) ON DELETE CASCADE,
  max_teams integer CHECK (max_teams IS NULL OR max_teams > 1),
  min_squad_size integer NOT NULL DEFAULT 1 CHECK (min_squad_size > 0),
  max_squad_size integer CHECK (max_squad_size IS NULL OR max_squad_size > 0),
  player_registration_enabled boolean NOT NULL DEFAULT true,
  owner_registration_mode text NOT NULL DEFAULT 'OPEN'
    CHECK (owner_registration_mode IN ('OPEN','INVITE_ONLY','ORGANIZER_ADDED')),
  public_live_enabled boolean NOT NULL DEFAULT true,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (max_squad_size IS NULL OR max_squad_size >= min_squad_size)
);

--------------------------------------------------------------------------------
-- 6. TOURNAMENT MEMBERS
--------------------------------------------------------------------------------
CREATE TABLE public.tournament_members (
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('ORGANIZER','TEAM_OWNER','PLAYER','SCORER')),
  team_id uuid, -- Foreign key added below after teams table exists
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, user_id, role)
);

--------------------------------------------------------------------------------
-- 7. TEAM OWNER INVITES
--------------------------------------------------------------------------------
CREATE TABLE public.team_owner_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  invite_code text NOT NULL UNIQUE,
  invited_phone text,
  invited_email text,
  expires_at timestamptz,
  used_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

--------------------------------------------------------------------------------
-- 8. TEAM OWNER APPLICATIONS
--------------------------------------------------------------------------------
CREATE TABLE public.team_owner_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  proposed_team_name text NOT NULL,
  team_short_name text,
  logo_path text,
  place text,
  phone text,
  email text,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','REJECTED','CHANGES_REQUESTED')),
  review_notes text,
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, user_id)
);

--------------------------------------------------------------------------------
-- 9. TEAMS
--------------------------------------------------------------------------------
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name text NOT NULL,
  short_name text,
  logo_path text,
  place text,
  primary_color text,
  secondary_color text,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','WITHDRAWN','DISQUALIFIED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, name)
);

-- Add foreign key from tournament_members to teams now that teams exists
ALTER TABLE public.tournament_members
  ADD CONSTRAINT tournament_members_team_fk
  FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

--------------------------------------------------------------------------------
-- 10. TEAM OWNERS
--------------------------------------------------------------------------------
CREATE TABLE public.team_owners (
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

-- Partial unique index to enforce at most one primary owner per team
CREATE UNIQUE INDEX team_owners_one_primary_per_team
ON public.team_owners (team_id)
WHERE is_primary = true AND status = 'ACTIVE';
