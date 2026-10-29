-- 20260920000020_auth_users_profile_trigger.sql
-- Phase 4 Stabilization: Automatically create public.profiles on user signup

--------------------------------------------------------------------------------
-- 1. Create the Trigger Function
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger AS $$
BEGIN
  -- Insert a profile for the new user. 
  -- ON CONFLICT DO NOTHING ensures idempotency and never overwrites an existing profile.
  INSERT INTO public.profiles (id, full_name, email, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NULLIF(split_part(NEW.email, '@', 1), ''), 'Unknown'),
    NEW.email,
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

--------------------------------------------------------------------------------
-- 2. Attach Trigger to auth.users
--------------------------------------------------------------------------------
-- Drop if exists to ensure idempotency
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

--------------------------------------------------------------------------------
-- 3. Safe Backfill for Existing Users (DO NOT RUN ON PRODUCTION WITHOUT APPROVAL)
--------------------------------------------------------------------------------
-- This backfills any users that were created before this trigger existed.
-- Because of the ON CONFLICT DO NOTHING logic, it will safely skip organizers
-- who already have profiles.
INSERT INTO public.profiles (id, full_name, email, updated_at)
SELECT 
  id,
  COALESCE(raw_user_meta_data->>'full_name', NULLIF(split_part(email, '@', 1), ''), 'Unknown'),
  email,
  now()
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;
