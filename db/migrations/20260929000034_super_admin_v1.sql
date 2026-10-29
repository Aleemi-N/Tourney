-- 20260929000034_super_admin_v1.sql
-- Platform Super Admin V1
--
-- Adds:
--   1. platform_super_admins table — stores platform-level super-admin identities.
--   2. is_platform_super_admin() helper — SECURITY DEFINER, used by RLS.
--   3. Tournament approval lifecycle columns (approval_status, submitted_at,
--      reviewed_at, reviewed_by, rejection_reason).
--   4. tournament_approval_history table — immutable audit trail per approval event.
--   5. RPCs: submit_tournament_for_approval, approve_tournament, reject_tournament,
--             suspend_organizer, reactivate_organizer, platform_dashboard_metrics.
--   6. RLS policies for super-admin tables and enriched tournament policies.
--   7. Backfill: existing legitimate (non-DRAFT) tournaments are grandfathered
--      to APPROVED so they are never retroactively blocked.
--   8. Audit log entries wired to the existing audit_logs table.
--
-- DOES NOT:
--   • Alter tournament IDs, slugs, teams, auctions, lots, scoring, standings.
--   • Remove or weaken any existing RLS policies.
--   • Use service_role credentials in application code.
--   • Block any existing approved tournaments.

--------------------------------------------------------------------------------
-- 1. PLATFORM SUPER ADMINS
--------------------------------------------------------------------------------
-- Minimal platform-level identity store.
-- Super Admin status is determined exclusively by the presence of a row
-- in this table — never by email or client-supplied claims.

CREATE TABLE public.platform_super_admins (
  user_id   uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  note       text
);

-- Performance index
CREATE INDEX idx_platform_super_admins_user ON public.platform_super_admins(user_id);

ALTER TABLE public.platform_super_admins ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- 2. is_platform_super_admin() HELPER
--------------------------------------------------------------------------------
-- SECURITY DEFINER to avoid RLS recursion.
-- Fixed search_path to prevent search_path injection.
-- Returns true iff the calling authenticated user is a platform super admin.

CREATE OR REPLACE FUNCTION public.is_platform_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_super_admins
    WHERE user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_super_admin() TO authenticated;

-- Only super admins can read the table; no regular user can inspect it.
-- The SECURITY DEFINER helper below bypasses this for internal checks.
CREATE POLICY "Super admins can read super admin list"
  ON public.platform_super_admins FOR SELECT
  USING (public.is_platform_super_admin());

-- No INSERT/UPDATE/DELETE policy via RLS — mutations happen via
-- service-role psql / seed / migration only (not from browser).
-- This prevents privilege escalation via the browser anon/authenticated key.


--------------------------------------------------------------------------------
-- 3. TOURNAMENT APPROVAL LIFECYCLE COLUMNS
--------------------------------------------------------------------------------
-- approval_status lifecycle:
--   APPROVED (default, grandfathered) → submit → PENDING_APPROVAL
--   PENDING_APPROVAL → approve → APPROVED
--   PENDING_APPROVAL → reject  → REJECTED
--   REJECTED → resubmit → PENDING_APPROVAL

ALTER TABLE public.tournaments
  ADD COLUMN approval_status text NOT NULL DEFAULT 'APPROVED'
    CHECK (approval_status IN ('APPROVED','PENDING_APPROVAL','REJECTED')),
  ADD COLUMN approval_submitted_at  timestamptz,
  ADD COLUMN approval_reviewed_at   timestamptz,
  ADD COLUMN approval_reviewed_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN approval_rejection_reason text;

-- Index for approval queue queries
CREATE INDEX idx_tournaments_approval_status ON public.tournaments(approval_status);

-- Backfill strategy:
-- Tournaments that existed before this migration and are NOT in DRAFT status
-- are considered legitimate and are grandfathered to APPROVED.
-- DRAFT tournaments (not yet submitted) start as APPROVED so organizers
-- can still submit and go through the new lifecycle.
--
-- Rationale: setting existing non-DRAFT tournaments to PENDING_APPROVAL would
-- suddenly block live/completed tournaments. Grandfathering to APPROVED is the
-- correct safe migration.

-- All pre-existing tournaments are already defaulted to APPROVED via the column
-- DEFAULT above. No additional UPDATE is needed because the DEFAULT applies to
-- existing rows in PostgreSQL ALTER TABLE ADD COLUMN with a non-volatile default.

-- Document the backfill explicitly in audit_logs for traceability.
INSERT INTO public.audit_logs (
  tournament_id,
  user_id,
  action,
  entity_type,
  entity_id,
  before_json,
  after_json,
  reason
)
SELECT
  id,
  created_by,
  'TOURNAMENT_GRANDFATHERED_APPROVED',
  'tournament',
  id,
  '{"approval_status": "not_set"}'::jsonb,
  '{"approval_status": "APPROVED"}'::jsonb,
  'Pre-existing tournament grandfathered to APPROVED on super-admin-v1 migration'
FROM public.tournaments;

--------------------------------------------------------------------------------
-- 4. TOURNAMENT APPROVAL HISTORY
--------------------------------------------------------------------------------
-- Immutable per-event history of approval state transitions.
-- Separate from the general audit_logs for queryability.

CREATE TABLE public.tournament_approval_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  event          text NOT NULL
    CHECK (event IN (
      'SUBMITTED_FOR_APPROVAL',
      'APPROVED',
      'REJECTED',
      'RESUBMITTED'
    )),
  actor_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason         text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tournament_approval_history_tourn ON public.tournament_approval_history(tournament_id, created_at DESC);

ALTER TABLE public.tournament_approval_history ENABLE ROW LEVEL SECURITY;

-- Organizer can read approval history for their own tournaments.
CREATE POLICY "Organizers can read own approval history"
  ON public.tournament_approval_history FOR SELECT
  USING (public.is_tournament_organizer(tournament_id));

-- Super admin can read all approval history.
CREATE POLICY "Super admins can read all approval history"
  ON public.tournament_approval_history FOR SELECT
  USING (public.is_platform_super_admin());

-- No direct INSERT/UPDATE/DELETE — only via SECURITY DEFINER RPCs.

--------------------------------------------------------------------------------
-- 5. RPC: submit_tournament_for_approval
--------------------------------------------------------------------------------
-- Called by: Organizer (from tournament settings/overview)
-- Guard: must be tournament organizer
-- Validates: tournament has required fields before allowing submission
-- State transitions: APPROVED (draft state meaning never approved) is NOT valid
--   source; only DRAFT approval path is: organizer submits from APPROVED
--   (i.e., initial state) → PENDING_APPROVAL, or REJECTED → PENDING_APPROVAL.
-- Concurrency: locks the tournament row for update.

CREATE OR REPLACE FUNCTION public.submit_tournament_for_approval(
  p_tournament_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament public.tournaments%ROWTYPE;
BEGIN
  -- Lock
  SELECT * INTO v_tournament FROM public.tournaments
  WHERE id = p_tournament_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'PT404';
  END IF;

  -- Auth
  IF NOT public.is_tournament_organizer(p_tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = 'PT403';
  END IF;

  -- Valid source states: APPROVED (initial, never submitted) or REJECTED (resubmit)
  IF v_tournament.approval_status = 'PENDING_APPROVAL' THEN
    RAISE EXCEPTION 'Tournament is already pending approval' USING ERRCODE = 'PT409';
  END IF;

  -- Basic validation: name must be non-empty
  IF trim(COALESCE(v_tournament.name, '')) = '' THEN
    RAISE EXCEPTION 'Tournament name is required before submitting for approval' USING ERRCODE = 'PT400';
  END IF;

  -- Determine event type
  DECLARE
    v_event text;
  BEGIN
    v_event := CASE v_tournament.approval_status
      WHEN 'REJECTED' THEN 'RESUBMITTED'
      ELSE 'SUBMITTED_FOR_APPROVAL'
    END;

    -- Update tournament
    UPDATE public.tournaments SET
      approval_status       = 'PENDING_APPROVAL',
      approval_submitted_at = now(),
      -- Clear previous rejection reason on resubmit
      approval_rejection_reason = NULL,
      updated_at = now()
    WHERE id = p_tournament_id;

    -- Record history
    INSERT INTO public.tournament_approval_history(tournament_id, event, actor_id)
    VALUES (p_tournament_id, v_event, auth.uid());

    -- Audit log
    INSERT INTO public.audit_logs(tournament_id, user_id, action, entity_type, entity_id, before_json, after_json)
    VALUES (
      p_tournament_id,
      auth.uid(),
      'TOURNAMENT_SUBMITTED_FOR_APPROVAL',
      'tournament',
      p_tournament_id,
      jsonb_build_object('approval_status', v_tournament.approval_status),
      jsonb_build_object('approval_status', 'PENDING_APPROVAL')
    );
  END;

  RETURN jsonb_build_object('ok', true, 'approval_status', 'PENDING_APPROVAL');
END;
$$;

REVOKE ALL ON FUNCTION public.submit_tournament_for_approval(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_tournament_for_approval(uuid) TO authenticated;

--------------------------------------------------------------------------------
-- 6. RPC: approve_tournament
--------------------------------------------------------------------------------
-- Called by: Super Admin only
-- Concurrency: SELECT ... FOR UPDATE prevents race conditions.

CREATE OR REPLACE FUNCTION public.approve_tournament(
  p_tournament_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament public.tournaments%ROWTYPE;
BEGIN
  -- Auth: must be platform super admin
  IF NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin only' USING ERRCODE = 'PT403';
  END IF;

  -- Lock
  SELECT * INTO v_tournament FROM public.tournaments
  WHERE id = p_tournament_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'PT404';
  END IF;

  -- Idempotency: already approved → no-op
  IF v_tournament.approval_status = 'APPROVED' THEN
    RETURN jsonb_build_object('ok', true, 'approval_status', 'APPROVED', 'note', 'Already approved');
  END IF;

  -- Only PENDING_APPROVAL can be approved
  IF v_tournament.approval_status != 'PENDING_APPROVAL' THEN
    RAISE EXCEPTION 'Tournament is not in PENDING_APPROVAL state' USING ERRCODE = 'PT409';
  END IF;

  -- Update
  UPDATE public.tournaments SET
    approval_status      = 'APPROVED',
    approval_reviewed_at = now(),
    approval_reviewed_by = auth.uid(),
    approval_rejection_reason = NULL,
    updated_at = now()
  WHERE id = p_tournament_id;

  -- History
  INSERT INTO public.tournament_approval_history(tournament_id, event, actor_id)
  VALUES (p_tournament_id, 'APPROVED', auth.uid());

  -- Audit
  INSERT INTO public.audit_logs(tournament_id, user_id, action, entity_type, entity_id, before_json, after_json)
  VALUES (
    p_tournament_id,
    auth.uid(),
    'TOURNAMENT_APPROVED',
    'tournament',
    p_tournament_id,
    jsonb_build_object('approval_status', v_tournament.approval_status),
    jsonb_build_object('approval_status', 'APPROVED')
  );

  RETURN jsonb_build_object('ok', true, 'approval_status', 'APPROVED');
END;
$$;

REVOKE ALL ON FUNCTION public.approve_tournament(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_tournament(uuid) TO authenticated;

--------------------------------------------------------------------------------
-- 7. RPC: reject_tournament
--------------------------------------------------------------------------------
-- Called by: Super Admin only
-- Requires a non-empty rejection reason.
-- Does NOT delete the tournament — organizer can resubmit after editing.

CREATE OR REPLACE FUNCTION public.reject_tournament(
  p_tournament_id uuid,
  p_reason        text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament public.tournaments%ROWTYPE;
BEGIN
  -- Auth
  IF NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin only' USING ERRCODE = 'PT403';
  END IF;

  -- Reason required
  IF trim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Rejection reason is required' USING ERRCODE = 'PT400';
  END IF;

  -- Lock
  SELECT * INTO v_tournament FROM public.tournaments
  WHERE id = p_tournament_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found' USING ERRCODE = 'PT404';
  END IF;

  -- Idempotency: already rejected with same reason → no-op
  IF v_tournament.approval_status = 'REJECTED' THEN
    RETURN jsonb_build_object('ok', true, 'approval_status', 'REJECTED', 'note', 'Already rejected');
  END IF;

  IF v_tournament.approval_status != 'PENDING_APPROVAL' THEN
    RAISE EXCEPTION 'Tournament is not in PENDING_APPROVAL state' USING ERRCODE = 'PT409';
  END IF;

  -- Update
  UPDATE public.tournaments SET
    approval_status           = 'REJECTED',
    approval_reviewed_at      = now(),
    approval_reviewed_by      = auth.uid(),
    approval_rejection_reason = trim(p_reason),
    updated_at = now()
  WHERE id = p_tournament_id;

  -- History
  INSERT INTO public.tournament_approval_history(tournament_id, event, actor_id, reason)
  VALUES (p_tournament_id, 'REJECTED', auth.uid(), trim(p_reason));

  -- Audit
  INSERT INTO public.audit_logs(tournament_id, user_id, action, entity_type, entity_id, before_json, after_json, reason)
  VALUES (
    p_tournament_id,
    auth.uid(),
    'TOURNAMENT_REJECTED',
    'tournament',
    p_tournament_id,
    jsonb_build_object('approval_status', v_tournament.approval_status),
    jsonb_build_object('approval_status', 'REJECTED', 'rejection_reason', trim(p_reason)),
    trim(p_reason)
  );

  RETURN jsonb_build_object('ok', true, 'approval_status', 'REJECTED');
END;
$$;

REVOKE ALL ON FUNCTION public.reject_tournament(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_tournament(uuid, text) TO authenticated;

--------------------------------------------------------------------------------
-- 8. RPC: suspend_organizer
--------------------------------------------------------------------------------
-- Suspends the organizer's profile (sets profiles.status = 'SUSPENDED').
-- Does NOT delete any tournament data.
-- Called by: Super Admin only.

CREATE OR REPLACE FUNCTION public.suspend_organizer(
  p_user_id uuid,
  p_reason  text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status text;
BEGIN
  IF NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin only' USING ERRCODE = 'PT403';
  END IF;

  SELECT status INTO v_current_status FROM public.profiles
  WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'PT404';
  END IF;

  IF v_current_status = 'SUSPENDED' THEN
    RETURN jsonb_build_object('ok', true, 'status', 'SUSPENDED', 'note', 'Already suspended');
  END IF;

  UPDATE public.profiles SET status = 'SUSPENDED', updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, before_json, after_json, reason)
  VALUES (
    auth.uid(),
    'ORGANIZER_SUSPENDED',
    'profile',
    p_user_id,
    jsonb_build_object('status', v_current_status),
    jsonb_build_object('status', 'SUSPENDED'),
    p_reason
  );

  RETURN jsonb_build_object('ok', true, 'status', 'SUSPENDED');
END;
$$;

REVOKE ALL ON FUNCTION public.suspend_organizer(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suspend_organizer(uuid, text) TO authenticated;

--------------------------------------------------------------------------------
-- 9. RPC: reactivate_organizer
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reactivate_organizer(
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status text;
BEGIN
  IF NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin only' USING ERRCODE = 'PT403';
  END IF;

  SELECT status INTO v_current_status FROM public.profiles
  WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'PT404';
  END IF;

  IF v_current_status = 'ACTIVE' THEN
    RETURN jsonb_build_object('ok', true, 'status', 'ACTIVE', 'note', 'Already active');
  END IF;

  UPDATE public.profiles SET status = 'ACTIVE', updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, before_json, after_json)
  VALUES (
    auth.uid(),
    'ORGANIZER_REACTIVATED',
    'profile',
    p_user_id,
    jsonb_build_object('status', v_current_status),
    jsonb_build_object('status', 'ACTIVE')
  );

  RETURN jsonb_build_object('ok', true, 'status', 'ACTIVE');
END;
$$;

REVOKE ALL ON FUNCTION public.reactivate_organizer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reactivate_organizer(uuid) TO authenticated;

--------------------------------------------------------------------------------
-- 10. RPC: platform_dashboard_metrics
--------------------------------------------------------------------------------
-- Returns aggregate platform metrics for the super admin dashboard.
-- Single round-trip, read-only, super admin only.

CREATE OR REPLACE FUNCTION public.platform_dashboard_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin only' USING ERRCODE = 'PT403';
  END IF;

  SELECT jsonb_build_object(
    'pending_approvals',   (SELECT COUNT(*) FROM tournaments WHERE approval_status = 'PENDING_APPROVAL'),
    'approved_tournaments',(SELECT COUNT(*) FROM tournaments WHERE approval_status = 'APPROVED'),
    'active_tournaments',  (SELECT COUNT(*) FROM tournaments WHERE status IN ('REGISTRATION','PREPARATION','LIVE') AND approval_status = 'APPROVED'),
    'completed_tournaments',(SELECT COUNT(*) FROM tournaments WHERE status = 'COMPLETED'),
    'organizer_count',     (SELECT COUNT(DISTINCT user_id) FROM organization_members WHERE role = 'OWNER'),
    'player_count',        (SELECT COUNT(*) FROM player_profiles),
    'team_count',          (SELECT COUNT(*) FROM teams WHERE status = 'ACTIVE'),
    'recent_submissions',  (
      SELECT jsonb_agg(row_to_json(s)) FROM (
        SELECT t.id, t.name, t.approval_status, t.approval_submitted_at,
               p.full_name AS organizer_name, p.id AS organizer_id
        FROM tournaments t
        JOIN profiles p ON p.id = t.created_by
        WHERE t.approval_submitted_at IS NOT NULL
        ORDER BY t.approval_submitted_at DESC
        LIMIT 10
      ) s
    ),
    'recent_reviews', (
      SELECT jsonb_agg(row_to_json(r)) FROM (
        SELECT tah.tournament_id, tah.event, tah.created_at, tah.reason,
               t.name AS tournament_name,
               p.full_name AS actor_name
        FROM tournament_approval_history tah
        JOIN tournaments t ON t.id = tah.tournament_id
        JOIN profiles p ON p.id = tah.actor_id
        WHERE tah.event IN ('APPROVED','REJECTED')
        ORDER BY tah.created_at DESC
        LIMIT 10
      ) r
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_dashboard_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_dashboard_metrics() TO authenticated;

--------------------------------------------------------------------------------
-- 11. RLS ADDITIONS FOR TOURNAMENTS (Super Admin can read all)
--------------------------------------------------------------------------------
-- Super admins need to read all tournament data for management.
-- This adds read-only super-admin policies without weakening existing ones.

CREATE POLICY "Super admins can read all tournaments"
  ON public.tournaments FOR SELECT
  USING (public.is_platform_super_admin());

CREATE POLICY "Super admins can read all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_platform_super_admin());

-- Super admins can read all audit logs (platform-wide view)
DROP POLICY IF EXISTS "Organizers can read audit logs" ON public.audit_logs;
CREATE POLICY "Organizers can read audit logs" ON public.audit_logs
  FOR SELECT USING (public.is_tournament_organizer(tournament_id));
CREATE POLICY "Super admins can read all audit logs" ON public.audit_logs
  FOR SELECT USING (public.is_platform_super_admin());

-- Super admins can read organization members (for organizer management)
CREATE POLICY "Super admins can read org members"
  ON public.organization_members FOR SELECT
  USING (public.is_platform_super_admin());

--------------------------------------------------------------------------------
-- 12. WHAT REQUIRES APPROVED STATUS (enforcement via check function)
--------------------------------------------------------------------------------
-- The following RPC checks approval before allowing public launch:
-- • publish_tournament (set status=REGISTRATION, is_public=true)
-- This prevents an unapproved tournament from being publicly launched.

-- Override the existing publish path: if approval_status != 'APPROVED',
-- block going to REGISTRATION/LIVE/is_public=true.
-- We add a trigger on tournaments that enforces this invariant.

CREATE OR REPLACE FUNCTION public.enforce_approval_before_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Block setting is_public=true or status beyond DRAFT for unapproved tournaments.
  -- Exemption: Super Admin can bypass (for emergency fixes).
  IF public.is_platform_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.approval_status != 'APPROVED' THEN
    -- Block making is_public=true on unapproved tournament
    IF NEW.is_public = true AND (OLD.is_public IS DISTINCT FROM NEW.is_public) THEN
      RAISE EXCEPTION 'Tournament must be approved before it can be made public'
        USING ERRCODE = 'PT403';
    END IF;
    -- Block advancing to REGISTRATION or beyond
    IF NEW.status IN ('REGISTRATION','PREPARATION','LIVE') AND
       OLD.status IS DISTINCT FROM NEW.status AND
       OLD.status = 'DRAFT' THEN
      RAISE EXCEPTION 'Tournament must be approved before it can be published'
        USING ERRCODE = 'PT403';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_approval_before_publish
  BEFORE UPDATE ON public.tournaments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_approval_before_publish();

--------------------------------------------------------------------------------
-- 13. INDEXES FOR SUPER ADMIN QUERIES
--------------------------------------------------------------------------------
CREATE INDEX idx_audit_logs_action_created ON public.audit_logs(action, created_at DESC);
CREATE INDEX idx_tournament_approval_history_event ON public.tournament_approval_history(event, created_at DESC);
CREATE INDEX idx_org_members_role_owner ON public.organization_members(user_id) WHERE role = 'OWNER';
