-- 0007_rls_policies.sql
-- Row Level Security Helpers and Policies

--------------------------------------------------------------------------------
-- 1. RLS HELPER FUNCTIONS
--------------------------------------------------------------------------------
-- All helpers must use SECURITY DEFINER and specify an explicit search_path
-- to avoid bypass attacks.

-- Check if user is an admin of the organization
CREATE OR REPLACE FUNCTION public.is_organization_admin(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND role IN ('OWNER', 'ADMIN')
      AND status = 'ACTIVE'
  );
$$;

-- Check if user is an organizer of the tournament
CREATE OR REPLACE FUNCTION public.is_tournament_organizer(tourn_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tournament_members
    WHERE tournament_id = tourn_id
      AND user_id = auth.uid()
      AND role = 'ORGANIZER'
      AND status = 'ACTIVE'
  );
$$;

-- Check if user is an owner of the team
CREATE OR REPLACE FUNCTION public.is_team_owner(t_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_owners
    WHERE team_id = t_id
      AND user_id = auth.uid()
      AND status = 'ACTIVE'
  );
$$;

-- Check if user is a member of the tournament (any active role)
CREATE OR REPLACE FUNCTION public.is_tournament_member(tourn_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tournament_members
    WHERE tournament_id = tourn_id
      AND user_id = auth.uid()
      AND status = 'ACTIVE'
  );
$$;

-- Check if user is an assigned scorer for a match
CREATE OR REPLACE FUNCTION public.is_assigned_scorer(m_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM match_scorers
    WHERE match_id = m_id
      AND user_id = auth.uid()
  );
$$;

--------------------------------------------------------------------------------
-- 2. ENABLE RLS
--------------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_owner_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_owner_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_tournament_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volleyball_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.volleyball_set_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_team_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purse_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_scorers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standings_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- 3. RLS POLICIES
--------------------------------------------------------------------------------

-- Profiles
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (id = auth.uid());

-- Organizations
CREATE POLICY "Members can read organizations" ON public.organizations FOR SELECT USING (
  EXISTS (SELECT 1 FROM organization_members WHERE organization_id = organizations.id AND user_id = auth.uid())
);
CREATE POLICY "Users can insert organizations" ON public.organizations FOR INSERT WITH CHECK (created_by = auth.uid());
CREATE POLICY "Admins can update organizations" ON public.organizations FOR UPDATE USING (is_organization_admin(id));

-- Organization Members
CREATE POLICY "Members can read org members" ON public.organization_members FOR SELECT USING (
  EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = organization_id AND om.user_id = auth.uid())
);
CREATE POLICY "Admins can manage org members" ON public.organization_members FOR ALL USING (is_organization_admin(organization_id));

-- Tournaments
CREATE POLICY "Public can read public tournaments" ON public.tournaments FOR SELECT USING (is_public = true);
CREATE POLICY "Members can read private tournaments" ON public.tournaments FOR SELECT USING (is_tournament_member(id));
CREATE POLICY "Org admins can insert tournaments" ON public.tournaments FOR INSERT WITH CHECK (is_organization_admin(organization_id));
CREATE POLICY "Organizers can update tournaments" ON public.tournaments FOR UPDATE USING (is_tournament_organizer(id));

-- Tournament Settings
CREATE POLICY "Public can read public settings" ON public.tournament_settings FOR SELECT USING (
  EXISTS (SELECT 1 FROM tournaments WHERE tournaments.id = tournament_settings.tournament_id AND is_public = true)
);
CREATE POLICY "Members can read private settings" ON public.tournament_settings FOR SELECT USING (is_tournament_member(tournament_id));
CREATE POLICY "Organizers can manage settings" ON public.tournament_settings FOR ALL USING (is_tournament_organizer(tournament_id));

-- Tournament Members
CREATE POLICY "Members can read tournament members" ON public.tournament_members FOR SELECT USING (is_tournament_member(tournament_id));
CREATE POLICY "Organizers can manage tournament members" ON public.tournament_members FOR ALL USING (is_tournament_organizer(tournament_id));

-- Teams
CREATE POLICY "Public can read public teams" ON public.teams FOR SELECT USING (
  EXISTS (SELECT 1 FROM tournaments WHERE tournaments.id = teams.tournament_id AND is_public = true)
);
CREATE POLICY "Members can read private teams" ON public.teams FOR SELECT USING (is_tournament_member(tournament_id));
CREATE POLICY "Organizers can manage teams" ON public.teams FOR ALL USING (is_tournament_organizer(tournament_id));
-- Team owners can update limited fields on their teams, but we must enforce this via RPC or strict column grants. 
-- For simplicity, standard UPDATE allows them to modify their team, but RPC is preferred for state changes.
CREATE POLICY "Team owners can update own team" ON public.teams FOR UPDATE USING (is_team_owner(id));

-- Team Owners
CREATE POLICY "Members can read team owners" ON public.team_owners FOR SELECT USING (
  EXISTS (SELECT 1 FROM teams WHERE teams.id = team_owners.team_id AND is_tournament_member(teams.tournament_id))
);
CREATE POLICY "Organizers can manage team owners" ON public.team_owners FOR ALL USING (
  EXISTS (SELECT 1 FROM teams WHERE teams.id = team_owners.team_id AND is_tournament_organizer(teams.tournament_id))
);

-- Player Profiles
CREATE POLICY "Players can read own profile" ON public.player_profiles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Players can update own profile" ON public.player_profiles FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Organizers can read all players" ON public.player_profiles FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM player_tournament_registrations ptr 
    JOIN tournaments t ON t.id = ptr.tournament_id 
    WHERE ptr.player_id = player_profiles.id AND is_tournament_organizer(t.id)
  )
);

-- Player Tournament Registrations
CREATE POLICY "Players can read own registrations" ON public.player_tournament_registrations FOR SELECT USING (
  EXISTS (SELECT 1 FROM player_profiles pp WHERE pp.id = player_id AND pp.user_id = auth.uid())
);
CREATE POLICY "Organizers can manage registrations" ON public.player_tournament_registrations FOR ALL USING (is_tournament_organizer(tournament_id));

-- Team Players
CREATE POLICY "Public can read public team players" ON public.team_players FOR SELECT USING (
  EXISTS (SELECT 1 FROM tournaments WHERE id = tournament_id AND is_public = true)
);
CREATE POLICY "Members can read private team players" ON public.team_players FOR SELECT USING (is_tournament_member(tournament_id));
CREATE POLICY "Organizers can manage team players" ON public.team_players FOR ALL USING (is_tournament_organizer(tournament_id));

-- Lot Sessions
CREATE POLICY "Members can read lot sessions" ON public.lot_sessions FOR SELECT USING (is_tournament_member(tournament_id));
CREATE POLICY "Organizers can manage lot sessions" ON public.lot_sessions FOR ALL USING (is_tournament_organizer(tournament_id));

-- Lot Entries (HIDDEN LOT SECURITY ENFORCEMENT)
-- 1. Organizers can read EVERYTHING.
CREATE POLICY "Organizers can read lot entries" ON public.lot_entries FOR SELECT USING (
  EXISTS (SELECT 1 FROM lot_sessions ls WHERE ls.id = lot_session_id AND is_tournament_organizer(ls.tournament_id))
);
-- 2. Members/Public can ONLY read if status = 'SELECTED'. Unrevealed players are hidden at the RLS level.
CREATE POLICY "Members can read revealed lot entries" ON public.lot_entries FOR SELECT USING (
  status = 'SELECTED' AND 
  EXISTS (SELECT 1 FROM lot_sessions ls WHERE ls.id = lot_session_id AND is_tournament_member(ls.tournament_id))
);
-- Note: mutations to lot_entries happen via security definer RPCs, so no INSERT/UPDATE/DELETE policies are needed for regular users.

-- Lot Turns
CREATE POLICY "Members can read lot turns" ON public.lot_turns FOR SELECT USING (
  EXISTS (SELECT 1 FROM lot_sessions ls WHERE ls.id = lot_session_id AND is_tournament_member(ls.tournament_id))
);
CREATE POLICY "Organizers can manage lot turns" ON public.lot_turns FOR ALL USING (
  EXISTS (SELECT 1 FROM lot_sessions ls WHERE ls.id = lot_session_id AND is_tournament_organizer(ls.tournament_id))
);

-- Auctions
CREATE POLICY "Members can read auctions" ON public.auctions FOR SELECT USING (is_tournament_member(tournament_id));
CREATE POLICY "Organizers can manage auctions" ON public.auctions FOR ALL USING (is_tournament_organizer(tournament_id));

-- Auction Team Wallets
CREATE POLICY "Members can read wallets" ON public.auction_team_wallets FOR SELECT USING (
  EXISTS (SELECT 1 FROM auctions a WHERE a.id = auction_id AND is_tournament_member(a.tournament_id))
);
CREATE POLICY "Organizers can manage wallets" ON public.auction_team_wallets FOR ALL USING (
  EXISTS (SELECT 1 FROM auctions a WHERE a.id = auction_id AND is_tournament_organizer(a.tournament_id))
);

-- Auction Players
CREATE POLICY "Members can read auction players" ON public.auction_players FOR SELECT USING (
  EXISTS (SELECT 1 FROM auctions a WHERE a.id = auction_id AND is_tournament_member(a.tournament_id))
);
CREATE POLICY "Organizers can manage auction players" ON public.auction_players FOR ALL USING (
  EXISTS (SELECT 1 FROM auctions a WHERE a.id = auction_id AND is_tournament_organizer(a.tournament_id))
);

-- Auction Bids
CREATE POLICY "Members can read bids" ON public.auction_bids FOR SELECT USING (
  EXISTS (SELECT 1 FROM auctions a WHERE a.id = auction_id AND is_tournament_member(a.tournament_id))
);
CREATE POLICY "Organizers can manage bids" ON public.auction_bids FOR ALL USING (
  EXISTS (SELECT 1 FROM auctions a WHERE a.id = auction_id AND is_tournament_organizer(a.tournament_id))
);

-- Auction Sales
CREATE POLICY "Members can read sales" ON public.auction_sales FOR SELECT USING (
  EXISTS (SELECT 1 FROM auction_players ap JOIN auctions a ON a.id = ap.auction_id WHERE ap.id = auction_player_id AND is_tournament_member(a.tournament_id))
);

-- Matches
CREATE POLICY "Public can read public matches" ON public.matches FOR SELECT USING (
  EXISTS (SELECT 1 FROM tournaments WHERE tournaments.id = matches.tournament_id AND is_public = true)
);
CREATE POLICY "Members can read private matches" ON public.matches FOR SELECT USING (is_tournament_member(tournament_id));
CREATE POLICY "Organizers can manage matches" ON public.matches FOR ALL USING (is_tournament_organizer(tournament_id));

-- Match Scorers
CREATE POLICY "Members can read scorers" ON public.match_scorers FOR SELECT USING (
  EXISTS (SELECT 1 FROM matches m WHERE m.id = match_id AND is_tournament_member(m.tournament_id))
);
CREATE POLICY "Organizers can manage scorers" ON public.match_scorers FOR ALL USING (
  EXISTS (SELECT 1 FROM matches m WHERE m.id = match_id AND is_tournament_organizer(m.tournament_id))
);

-- Match Sets & Score Events
CREATE POLICY "Public can read public sets" ON public.match_sets FOR SELECT USING (
  EXISTS (SELECT 1 FROM matches m JOIN tournaments t ON t.id = m.tournament_id WHERE m.id = match_sets.match_id AND t.is_public = true)
);
CREATE POLICY "Members can read private sets" ON public.match_sets FOR SELECT USING (
  EXISTS (SELECT 1 FROM matches m WHERE m.id = match_sets.match_id AND is_tournament_member(m.tournament_id))
);
-- Mutated via RPC, read-only for most
CREATE POLICY "Public can read score events" ON public.score_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM matches m JOIN tournaments t ON t.id = m.tournament_id WHERE m.id = score_events.match_id AND t.is_public = true)
);
CREATE POLICY "Members can read score events" ON public.score_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM matches m WHERE m.id = score_events.match_id AND is_tournament_member(m.tournament_id))
);

-- Audit Logs
CREATE POLICY "Organizers can read audit logs" ON public.audit_logs FOR SELECT USING (is_tournament_organizer(tournament_id));
-- No normal updates to audit logs (appended via RPCs)

-- Notifications
CREATE POLICY "Users can read own notifications" ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (user_id = auth.uid());
