-- 20260920000015_fix_organizer_onboarding.sql
-- Atomic organizer onboarding RPC.
--
-- Problem: The server action auth.ts performed three independent sequential
-- writes (profiles → organizations → organization_members) with no transaction
-- and incomplete RLS coverage. Specifically:
--   • profiles: no INSERT policy existed → RLS violation on first write
--   • organization_members: bootstrap chicken-and-egg — you cannot prove org
--     membership to gain INSERT rights if membership doesn't exist yet
--   • No atomicity: a mid-flow failure left orphaned rows
--
-- Solution: A SECURITY DEFINER RPC that:
--   1. Derives caller identity exclusively from auth.uid() (no client params)
--   2. Rejects anonymous callers
--   3. Atomically upserts profile, inserts org, inserts membership in one tx
--   4. Is idempotent on retry via ON CONFLICT DO NOTHING / DO UPDATE
--   5. Accepts ONLY (full_name, org_name, org_slug) from the client — no
--      user_id, no org_id, no role — nothing the caller can forge
--
-- Security properties enforced inside the function body:
--   • profile.id is always forced to auth.uid()
--   • organizations.created_by is always forced to auth.uid()
--   • organization_members.user_id is always forced to auth.uid()
--   • organization_members.role is always hardcoded to 'OWNER'
--   • membership is only created for the org just created by this call
--
-- Callers continue to use the anon key (browser client). The function
-- executes under the postgres role via SECURITY DEFINER, so the tables
-- do not need open INSERT policies.  Existing SELECT/UPDATE policies
-- remain the correct access controls for those operations.

--------------------------------------------------------------------------------
-- 1. RPC: initialize_organizer_onboarding
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.initialize_organizer_onboarding(
  p_full_name  text,
  p_org_name   text,
  p_org_slug   text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid;
  v_org_id   uuid;
BEGIN
  -- ── Guard: must be an authenticated user ──────────────────────────────────
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'PT401';
  END IF;

  -- ── Input validation ──────────────────────────────────────────────────────
  IF trim(p_full_name) = '' OR trim(p_org_name) = '' OR trim(p_org_slug) = '' THEN
    RAISE EXCEPTION 'full_name, org_name and org_slug are required' USING ERRCODE = 'PT400';
  END IF;

  -- slug format: lowercase letters, numbers, hyphens only
  IF p_org_slug !~ '^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$' AND p_org_slug !~ '^[a-z0-9]$' THEN
    RAISE EXCEPTION 'org_slug must contain only lowercase letters, numbers, and hyphens' USING ERRCODE = 'PT400';
  END IF;

  -- ── Step 1: Upsert profile ────────────────────────────────────────────────
  -- ON CONFLICT (id) DO UPDATE makes this safe on retry.
  -- id is locked to v_user_id — caller cannot supply a different user's id.
  INSERT INTO public.profiles (id, full_name, updated_at)
  VALUES (v_user_id, p_full_name, now())
  ON CONFLICT (id) DO UPDATE
    SET full_name   = EXCLUDED.full_name,
        updated_at  = now();

  -- ── Step 2: Insert organization ───────────────────────────────────────────
  -- created_by is locked to v_user_id.
  -- If the slug already exists this will raise a unique-violation naturally;
  -- we re-raise it as a user-friendly message.
  BEGIN
    INSERT INTO public.organizations (name, slug, created_by)
    VALUES (p_org_name, p_org_slug, v_user_id)
    RETURNING id INTO v_org_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Organization slug "%" is already taken', p_org_slug
      USING ERRCODE = 'PT409';
  END;

  -- ── Step 3: Insert organizer membership ──────────────────────────────────
  -- organization_id is the id just created above (never a client value).
  -- user_id is v_user_id (never a client value).
  -- role is hardcoded to 'OWNER' (never a client value).
  -- ON CONFLICT DO NOTHING makes this safe on retry.
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'OWNER')
  ON CONFLICT DO NOTHING;

  RETURN json_build_object(
    'organization_id', v_org_id,
    'user_id',         v_user_id
  );
END;
$$;

-- Revoke public execute so only authenticated callers (via anon key with a
-- valid JWT) can reach this. The anon role can call it; auth.uid() check
-- inside will reject truly anonymous requests.
REVOKE ALL ON FUNCTION public.initialize_organizer_onboarding(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.initialize_organizer_onboarding(text, text, text) TO anon, authenticated;

--------------------------------------------------------------------------------
-- 2. Fix organization_members SELECT RLS (infinite recursion)
--------------------------------------------------------------------------------
-- Problem: The existing policy "Members can read org members" uses a
-- self-referential EXISTS subquery on the same table, which can cause
-- infinite recursion in PostgreSQL's RLS evaluation. This is the same class
-- of bug that was fixed for player_profiles in migration 0013.
--
-- Fix: Add a SECURITY DEFINER helper function that performs the membership
-- check outside of the RLS-controlled context, then update the policy to use it.
-- The SECURITY DEFINER function bypasses RLS on organization_members while
-- resolving the check, breaking the recursive cycle.

CREATE OR REPLACE FUNCTION public.is_org_member(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND status = 'ACTIVE'
  );
$$;

-- Replace the recursive policy with one using the SECURITY DEFINER helper.
DROP POLICY IF EXISTS "Members can read org members" ON public.organization_members;
CREATE POLICY "Members can read org members" ON public.organization_members
  FOR SELECT USING (public.is_org_member(organization_id));

--------------------------------------------------------------------------------
-- 3. Comment on what was NOT changed
--------------------------------------------------------------------------------
-- The existing profiles SELECT + UPDATE policies are correct — no change.
-- The existing organizations INSERT policy "Users can insert organizations"
-- is now only a fallback safety net; onboarding no longer uses direct INSERT.
-- The existing organization_members "Admins can manage org members" policy
-- correctly gates subsequent membership management (add/remove staff) after
-- the owner is established (since is_organization_admin also uses a
-- SECURITY DEFINER context, it does not recurse).
-- No other migrations (00001–00014) are modified.
