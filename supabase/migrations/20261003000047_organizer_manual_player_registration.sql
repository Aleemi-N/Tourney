-- 20261003000047_organizer_manual_player_registration.sql
--
-- Adds an RPC that allows an organizer to manually register a player into
-- a tournament. This is for cases where a player has trouble registering
-- themselves (e.g., no account, phone-only users, registration link issues).
--
-- The function:
--   1. Verifies the caller is an organizer of the tournament.
--   2. Looks up whether a player_profile already exists for the given email.
--      If not, creates one (name + phone required).
--   3. Creates / finds the player_tournament_registration for this player+tournament
--      and sets status = APPROVED immediately (organizer-initiated registrations
--      bypass the PENDING queue since the organizer is vouching for the player).
--   4. Inserts an audit_log entry.
--
-- Parameters:
--   p_tournament_id   uuid      — target tournament
--   p_display_name    text      — player's full display name
--   p_phone           text      — player's phone number (used for dedup lookup)
--   p_email           text      — optional: player's email (shown on profile)
--   p_primary_position text     — LIBERO | OUTSIDE_HITTER | MIDDLE_BLOCKER |
--                                   OPPOSITE | SETTER | RIGHT_SIDE
--   p_secondary_position text   — optional
--   p_jersey_name     text      — optional jersey name (defaults to display_name)
--   p_jersey_number   int       — optional
--   p_jersey_size     text      — optional (XS/S/M/L/XL/XXL)
--   p_height_cm       int       — optional
--   p_place           text      — optional home town
--   p_notes           text      — optional organizer notes on the registration

CREATE OR REPLACE FUNCTION public.organizer_register_player(
  p_tournament_id      uuid,
  p_display_name       text,
  p_phone              text,
  p_email              text      DEFAULT NULL,
  p_primary_position   text      DEFAULT NULL,
  p_secondary_position text      DEFAULT NULL,
  p_jersey_name        text      DEFAULT NULL,
  p_jersey_number      int       DEFAULT NULL,
  p_jersey_size        text      DEFAULT NULL,
  p_height_cm          int       DEFAULT NULL,
  p_place              text      DEFAULT NULL,
  p_notes              text      DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organizer_id   uuid := auth.uid();
  v_profile_id     uuid;
  v_reg_id         uuid;
  v_existing_reg   uuid;
BEGIN
  -- 1. Auth check
  IF v_organizer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  END IF;

  -- 2. Organizer check
  IF NOT public.is_tournament_organizer(p_tournament_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  END IF;

  -- 3. Tournament must be in REGISTRATION or PREPARATION status
  IF NOT EXISTS (
    SELECT 1 FROM public.tournaments
    WHERE id = p_tournament_id
      AND status IN ('REGISTRATION', 'PREPARATION', 'LIVE')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TOURNAMENT_NOT_OPEN');
  END IF;

  -- 4. Name and phone required
  IF btrim(p_display_name) = '' OR p_display_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NAME_REQUIRED');
  END IF;
  IF btrim(p_phone) = '' OR p_phone IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PHONE_REQUIRED');
  END IF;

  -- 5. Find or create player_profile by phone number
  --    Phone is the most reliable dedup key for manually-added players
  SELECT id INTO v_profile_id
  FROM public.player_profiles
  WHERE phone = btrim(p_phone)
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    -- Create a profile without a user_id (organizer-created, no auth account required)
    INSERT INTO public.player_profiles (
      display_name,
      phone,
      primary_position,
      secondary_position,
      jersey_name,
      jersey_number,
      jersey_size,
      height_cm,
      place
    ) VALUES (
      btrim(p_display_name),
      btrim(p_phone),
      NULLIF(btrim(COALESCE(p_primary_position, '')), ''),
      NULLIF(btrim(COALESCE(p_secondary_position, '')), ''),
      NULLIF(btrim(COALESCE(p_jersey_name, p_display_name)), ''),
      p_jersey_number,
      NULLIF(btrim(COALESCE(p_jersey_size, '')), ''),
      p_height_cm,
      NULLIF(btrim(COALESCE(p_place, '')), '')
    )
    RETURNING id INTO v_profile_id;
  ELSE
    -- Update name and optional fields on the existing profile
    UPDATE public.player_profiles SET
      display_name         = btrim(p_display_name),
      primary_position     = COALESCE(NULLIF(btrim(COALESCE(p_primary_position,'')),  ''), primary_position),
      secondary_position   = COALESCE(NULLIF(btrim(COALESCE(p_secondary_position,'')), ''), secondary_position),
      jersey_name          = COALESCE(NULLIF(btrim(COALESCE(p_jersey_name,'')), ''), jersey_name),
      jersey_number        = COALESCE(p_jersey_number, jersey_number),
      jersey_size          = COALESCE(NULLIF(btrim(COALESCE(p_jersey_size,'')), ''), jersey_size),
      height_cm            = COALESCE(p_height_cm, height_cm),
      place                = COALESCE(NULLIF(btrim(COALESCE(p_place,'')), ''), place)
    WHERE id = v_profile_id;
  END IF;

  -- 6. Check for existing registration
  SELECT id INTO v_existing_reg
  FROM public.player_tournament_registrations
  WHERE tournament_id = p_tournament_id
    AND player_id = v_profile_id;

  IF v_existing_reg IS NOT NULL THEN
    -- Already registered — update to APPROVED if not already
    UPDATE public.player_tournament_registrations
    SET
      status       = 'APPROVED',
      review_notes = COALESCE(NULLIF(btrim(COALESCE(p_notes,'')), ''), review_notes)
    WHERE id = v_existing_reg
      AND status != 'APPROVED';

    v_reg_id := v_existing_reg;
  ELSE
    -- Insert new registration pre-approved
    INSERT INTO public.player_tournament_registrations (
      tournament_id,
      player_id,
      status,
      review_notes
    ) VALUES (
      p_tournament_id,
      v_profile_id,
      'APPROVED',
      NULLIF(btrim(COALESCE(p_notes, '')), '')
    )
    RETURNING id INTO v_reg_id;
  END IF;

  -- 7. Audit log
  INSERT INTO public.audit_logs (tournament_id, user_id, action, entity_type, entity_id, after_json)
  VALUES (
    p_tournament_id,
    v_organizer_id,
    'PLAYER_MANUAL_REGISTRATION',
    'player_tournament_registrations',
    v_reg_id,
    jsonb_build_object(
      'player_id',   v_profile_id,
      'display_name', btrim(p_display_name),
      'phone',        btrim(p_phone),
      'notes',        p_notes
    )
  );

  RETURN jsonb_build_object('ok', true, 'registration_id', v_reg_id, 'player_id', v_profile_id);
END;
$$;

-- Only authenticated tournament organizers can call this RPC
REVOKE EXECUTE ON FUNCTION public.organizer_register_player FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.organizer_register_player TO authenticated;
