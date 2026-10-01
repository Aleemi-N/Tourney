-- 20260930000036_security_linter_fixes.sql
-- Resolves Supabase Database Linter Warnings:
-- 1. Auth RLS Initialization Plan: Wraps auth.uid() in (SELECT auth.uid()) for query optimizer scalar caching.
-- 2. Multiple Permissive Policies: Drops all legacy multi-role policies and replaces them with unified single-action policies per table.
-- 3. Security Definer Functions: Revokes public execute access on security definer RPC functions.

--------------------------------------------------------------------------------
-- 1. OPTIMIZE RLS HELPER FUNCTIONS WITH (SELECT auth.uid())
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_organization_admin(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id
      AND user_id = (SELECT auth.uid())
      AND role IN ('OWNER', 'ADMIN')
      AND status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tournament_organizer(tourn_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tournament_members
    WHERE tournament_id = tourn_id
      AND user_id = (SELECT auth.uid())
      AND role = 'ORGANIZER'
      AND status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_team_owner(t_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_owners
    WHERE team_id = t_id
      AND user_id = (SELECT auth.uid())
      AND status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tournament_member(tourn_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tournament_members
    WHERE tournament_id = tourn_id
      AND user_id = (SELECT auth.uid())
      AND status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_scorer(m_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM match_scorers
    WHERE match_id = m_id
      AND user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_platform_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_super_admins
    WHERE user_id = (SELECT auth.uid())
  );
$$;

--------------------------------------------------------------------------------
-- 2. DYNAMICALLY DROP ALL PREVIOUS POLICIES ON PUBLIC TABLES
--------------------------------------------------------------------------------

DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname, tablename, schemaname
        FROM pg_policies
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
END $$;

--------------------------------------------------------------------------------
-- 3. RE-CREATE CONSOLIDATED SINGLE PERMISSIVE POLICIES BY TABLE
--------------------------------------------------------------------------------

-- Table: public.profiles
CREATE POLICY "profiles_select_policy" ON public.profiles
  FOR SELECT USING (
    id = (SELECT auth.uid()) OR public.is_platform_super_admin()
  );

CREATE POLICY "profiles_update_policy" ON public.profiles
  FOR UPDATE USING (id = (SELECT auth.uid()));

-- Table: public.organizations
CREATE POLICY "organizations_select_policy" ON public.organizations
  FOR SELECT USING (
    public.is_organization_admin(id) OR public.is_platform_super_admin()
  );

CREATE POLICY "organizations_insert_policy" ON public.organizations
  FOR INSERT WITH CHECK (created_by = (SELECT auth.uid()));

CREATE POLICY "organizations_update_policy" ON public.organizations
  FOR UPDATE USING (public.is_organization_admin(id));

-- Table: public.organization_members
CREATE POLICY "organization_members_select_policy" ON public.organization_members
  FOR SELECT USING (
    user_id = (SELECT auth.uid()) 
    OR public.is_organization_admin(organization_id) 
    OR public.is_platform_super_admin()
  );

CREATE POLICY "organization_members_insert_policy" ON public.organization_members
  FOR INSERT WITH CHECK (public.is_organization_admin(organization_id));

CREATE POLICY "organization_members_update_policy" ON public.organization_members
  FOR UPDATE USING (public.is_organization_admin(organization_id));

CREATE POLICY "organization_members_delete_policy" ON public.organization_members
  FOR DELETE USING (public.is_organization_admin(organization_id));

-- Table: public.tournaments
CREATE POLICY "tournaments_select_policy" ON public.tournaments
  FOR SELECT USING (
    is_public = true 
    OR public.is_tournament_member(id) 
    OR public.is_platform_super_admin()
  );

CREATE POLICY "tournaments_insert_policy" ON public.tournaments
  FOR INSERT WITH CHECK (public.is_organization_admin(organization_id));

CREATE POLICY "tournaments_update_policy" ON public.tournaments
  FOR UPDATE USING (
    public.is_tournament_organizer(id) OR public.is_organization_admin(organization_id) OR public.is_platform_super_admin()
  );

-- Table: public.tournament_settings
CREATE POLICY "tournament_settings_select_policy" ON public.tournament_settings
  FOR SELECT USING (
    public.is_tournament_member(tournament_id) OR public.is_platform_super_admin()
  );

CREATE POLICY "tournament_settings_update_policy" ON public.tournament_settings
  FOR UPDATE USING (public.is_tournament_organizer(tournament_id));

-- Table: public.tournament_members
CREATE POLICY "tournament_members_select_policy" ON public.tournament_members
  FOR SELECT USING (
    user_id = (SELECT auth.uid()) 
    OR public.is_tournament_member(tournament_id) 
    OR public.is_platform_super_admin()
  );

-- Table: public.team_owner_applications
CREATE POLICY "team_owner_applications_select_policy" ON public.team_owner_applications
  FOR SELECT USING (
    user_id = (SELECT auth.uid()) 
    OR public.is_tournament_organizer(tournament_id) 
    OR public.is_platform_super_admin()
  );

CREATE POLICY "team_owner_applications_insert_policy" ON public.team_owner_applications
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "team_owner_applications_update_policy" ON public.team_owner_applications
  FOR UPDATE USING (
    user_id = (SELECT auth.uid()) OR public.is_tournament_organizer(tournament_id)
  );

-- Table: public.teams
CREATE POLICY "teams_select_policy" ON public.teams
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM tournaments t WHERE t.id = teams.tournament_id AND t.is_public = true)
    OR public.is_tournament_member(tournament_id)
    OR public.is_platform_super_admin()
  );

-- Table: public.team_owners
CREATE POLICY "team_owners_select_policy" ON public.team_owners
  FOR SELECT USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM teams t WHERE t.id = team_owners.team_id AND public.is_tournament_member(t.tournament_id))
    OR public.is_platform_super_admin()
  );

-- Table: public.team_players
CREATE POLICY "team_players_select_policy" ON public.team_players
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM teams t 
      JOIN tournaments tr ON tr.id = t.tournament_id 
      WHERE t.id = team_players.team_id AND (tr.is_public = true OR public.is_tournament_member(tr.id))
    )
    OR public.is_platform_super_admin()
  );

-- Table: public.player_profiles
CREATE POLICY "player_profiles_select_policy" ON public.player_profiles
  FOR SELECT USING (
    user_id = (SELECT auth.uid())
    OR public.is_platform_super_admin()
    OR EXISTS (
      SELECT 1 FROM player_tournament_registrations r
      WHERE r.player_id = player_profiles.id
        AND (public.is_tournament_member(r.tournament_id) OR EXISTS (
          SELECT 1 FROM tournaments t WHERE t.id = r.tournament_id AND t.is_public = true
        ))
    )
  );

CREATE POLICY "player_profiles_update_policy" ON public.player_profiles
  FOR UPDATE USING (user_id = (SELECT auth.uid()));

-- Table: public.player_tournament_registrations
CREATE POLICY "player_tournament_registrations_select_policy" ON public.player_tournament_registrations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM player_profiles p WHERE p.id = player_tournament_registrations.player_id AND p.user_id = (SELECT auth.uid()))
    OR public.is_tournament_member(tournament_id)
    OR public.is_platform_super_admin()
  );

-- Table: public.volleyball_rules
CREATE POLICY "volleyball_rules_select_policy" ON public.volleyball_rules
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM tournaments t WHERE t.id = volleyball_rules.tournament_id AND t.is_public = true)
    OR public.is_tournament_member(tournament_id)
    OR public.is_platform_super_admin()
  );

-- Table: public.auction_bids
CREATE POLICY "auction_bids_select_policy" ON public.auction_bids
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM auctions a WHERE a.id = auction_bids.auction_id AND public.is_tournament_member(a.tournament_id))
    OR public.is_platform_super_admin()
  );

-- Table: public.auction_players
CREATE POLICY "auction_players_select_policy" ON public.auction_players
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM auctions a WHERE a.id = auction_players.auction_id AND public.is_tournament_member(a.tournament_id))
    OR public.is_platform_super_admin()
  );

-- Table: public.auction_team_wallets
CREATE POLICY "auction_team_wallets_select_policy" ON public.auction_team_wallets
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM auctions a WHERE a.id = auction_team_wallets.auction_id AND public.is_tournament_member(a.tournament_id))
    OR public.is_platform_super_admin()
  );

-- Table: public.auctions
CREATE POLICY "auctions_select_policy" ON public.auctions
  FOR SELECT USING (
    public.is_tournament_member(tournament_id) OR public.is_platform_super_admin()
  );

-- Table: public.matches
CREATE POLICY "matches_select_policy" ON public.matches
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM tournaments t WHERE t.id = matches.tournament_id AND t.is_public = true)
    OR public.is_tournament_member(tournament_id)
    OR public.is_platform_super_admin()
  );

-- Table: public.match_sets
CREATE POLICY "match_sets_select_policy" ON public.match_sets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM matches m 
      JOIN tournaments t ON t.id = m.tournament_id 
      WHERE m.id = match_sets.match_id AND (t.is_public = true OR public.is_tournament_member(t.id))
    )
    OR public.is_platform_super_admin()
  );

-- Table: public.tournament_approval_history
CREATE POLICY "tournament_approval_history_select_policy" ON public.tournament_approval_history
  FOR SELECT USING (
    public.is_tournament_organizer(tournament_id) OR public.is_platform_super_admin()
  );

-- Table: public.tournament_branding
CREATE POLICY "tournament_branding_select_policy" ON public.tournament_branding
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM tournaments t WHERE t.id = tournament_branding.tournament_id AND t.is_public = true)
    OR public.is_tournament_member(tournament_id)
    OR public.is_tournament_organizer(tournament_id)
    OR public.is_platform_super_admin()
  );

CREATE POLICY "tournament_branding_insert_policy" ON public.tournament_branding
  FOR INSERT WITH CHECK (public.is_tournament_organizer(tournament_id));

CREATE POLICY "tournament_branding_update_policy" ON public.tournament_branding
  FOR UPDATE USING (public.is_tournament_organizer(tournament_id));

CREATE POLICY "tournament_branding_delete_policy" ON public.tournament_branding
  FOR DELETE USING (public.is_tournament_organizer(tournament_id));

-- Table: public.audit_logs
CREATE POLICY "audit_logs_select_policy" ON public.audit_logs
  FOR SELECT USING (
    public.is_tournament_organizer(tournament_id) OR public.is_platform_super_admin()
  );

-- Table: public.notifications
CREATE POLICY "notifications_select_policy" ON public.notifications
  FOR SELECT USING (
    user_id = (SELECT auth.uid()) OR public.is_platform_super_admin()
  );

CREATE POLICY "notifications_update_policy" ON public.notifications
  FOR UPDATE USING (user_id = (SELECT auth.uid()));

-- Table: public.platform_super_admins
CREATE POLICY "platform_super_admins_select_policy" ON public.platform_super_admins
  FOR SELECT USING (public.is_platform_super_admin());

--------------------------------------------------------------------------------
-- 4. REVOKE PUBLIC EXECUTE FROM ALL SECURITY DEFINER RPC FUNCTIONS
--------------------------------------------------------------------------------

DO $$
DECLARE
    func RECORD;
BEGIN
    FOR func IN
        SELECT p.oid::regprocedure AS func_signature
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef = true
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', func.func_signature);
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', func.func_signature);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', func.func_signature);
    END LOOP;
END $$;

-- Explicitly grant public spectator read RPC helpers to anon for unauthenticated viewing
DO $$
DECLARE
    pub_func RECORD;
BEGIN
    FOR pub_func IN
        SELECT p.oid::regprocedure AS func_signature
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
            'get_public_match_state',
            'get_public_standings',
            'get_auction_public_state',
            'get_lot_public_state',
            'get_public_live_state'
          )
    LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', pub_func.func_signature);
    END LOOP;
END $$;
