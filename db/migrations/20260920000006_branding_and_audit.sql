-- 0006_branding_and_audit.sql
-- Branding, templates, notifications, audit logs, and critical indexes

--------------------------------------------------------------------------------
-- 1. TOURNAMENT BRANDING
--------------------------------------------------------------------------------
CREATE TABLE public.tournament_branding (
  tournament_id uuid PRIMARY KEY REFERENCES public.tournaments(id) ON DELETE CASCADE,
  primary_color text,
  secondary_color text,
  logo_path text,
  background_path text,
  font_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

--------------------------------------------------------------------------------
-- 2. SPONSORS
--------------------------------------------------------------------------------
CREATE TABLE public.sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name text NOT NULL,
  logo_path text,
  website text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

--------------------------------------------------------------------------------
-- 3. TEMPLATES
--------------------------------------------------------------------------------
CREATE TABLE public.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  template_type text NOT NULL
    CHECK (template_type IN (
      'FIXTURE','TODAYS_MATCHES','TOMORROWS_MATCHES','RESULT',
      'POINTS_TABLE','PLAYER_OF_MATCH','ICON_SELECTION',
      'SETTER_SELECTION','SOLD','SQUAD','TOP_PERFORMERS',
      'SEMI_FINAL','FINAL','CHAMPION','RUNNER_UP'
    )),
  name text NOT NULL,
  layout_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

--------------------------------------------------------------------------------
-- 4. NOTIFICATIONS
--------------------------------------------------------------------------------
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tournament_id uuid REFERENCES public.tournaments(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  data_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

--------------------------------------------------------------------------------
-- 5. AUDIT LOGS
--------------------------------------------------------------------------------
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_json jsonb,
  after_json jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

--------------------------------------------------------------------------------
-- 6. IMPORTANT PERFORMANCE & FK INDEXES
--------------------------------------------------------------------------------

-- Tournaments
CREATE INDEX idx_tournaments_org_status ON public.tournaments (organization_id, status);

-- Members
CREATE INDEX idx_tournament_members_user_tourney ON public.tournament_members (user_id, tournament_id);

-- Teams
CREATE INDEX idx_teams_tourney_status ON public.teams (tournament_id, status);

-- Registrations
CREATE INDEX idx_registrations_tourney_status ON public.player_tournament_registrations (tournament_id, status);

-- Lot Sessions
CREATE INDEX idx_lot_sessions_tourney_type_status ON public.lot_sessions (tournament_id, lot_type, status);

-- Lot Turns
CREATE INDEX idx_lot_turns_session_status ON public.lot_turns (lot_session_id, status);

-- Auctions
CREATE INDEX idx_auction_bids_player_created ON public.auction_bids (auction_player_id, created_at DESC);
CREATE INDEX idx_auction_players_status_order ON public.auction_players (auction_id, status, auction_order);

-- Matches
CREATE INDEX idx_matches_tourney_stage_status_sched ON public.matches (tournament_id, stage_id, status, scheduled_at);

-- Scores
CREATE INDEX idx_score_events_match_seq ON public.score_events (match_id, sequence_number);

-- Notifications
CREATE INDEX idx_notifications_user_read_created ON public.notifications (user_id, read_at, created_at DESC);

-- Audit
CREATE INDEX idx_audit_logs_tourney_created ON public.audit_logs (tournament_id, created_at DESC);
