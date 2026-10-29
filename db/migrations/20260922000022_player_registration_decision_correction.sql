-- 0022_player_registration_decision_correction.sql
-- Safe, audited organizer correction of player registration decisions.

--------------------------------------------------------------------------------
-- 1. REVOKE PLAYER APPROVAL (APPROVED -> PENDING)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.revoke_player_approval(
  p_registration_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tournament_id uuid;
  v_organization_id uuid;
  v_player_id uuid;
  v_status text;
  v_reason text := nullif(btrim(p_reason), '');
BEGIN
  SELECT r.tournament_id, t.organization_id, r.player_id, r.status
  INTO v_tournament_id, v_organization_id, v_player_id, v_status
  FROM public.player_tournament_registrations r
  JOIN public.tournaments t ON t.id = r.tournament_id
  WHERE r.id = p_registration_id
  FOR UPDATE OF r;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REGISTRATION_NOT_FOUND');
  END IF;

  IF v_actor IS NULL OR NOT public.is_tournament_organizer(v_tournament_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  END IF;

  IF v_status <> 'APPROVED' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'status', v_status);
  END IF;

  IF v_reason IS NOT NULL AND char_length(v_reason) > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REASON_TOO_LONG');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.team_players tp
    WHERE tp.tournament_id = v_tournament_id
      AND tp.player_id = v_player_id
  ) OR EXISTS (
    SELECT 1
    FROM public.lot_entries le
    JOIN public.lot_sessions ls ON ls.id = le.lot_session_id
    WHERE ls.tournament_id = v_tournament_id
      AND le.player_id = v_player_id
  ) OR EXISTS (
    SELECT 1
    FROM public.auction_players ap
    JOIN public.auctions a ON a.id = ap.auction_id
    WHERE a.tournament_id = v_tournament_id
      AND ap.player_id = v_player_id
  ) OR EXISTS (
    SELECT 1
    FROM public.auction_sales sale
    JOIN public.auction_players ap ON ap.id = sale.auction_player_id
    JOIN public.auctions a ON a.id = ap.auction_id
    WHERE a.tournament_id = v_tournament_id
      AND ap.player_id = v_player_id
  ) OR EXISTS (
    SELECT 1
    FROM public.purse_transactions pt
    JOIN public.auction_team_wallets wallet ON wallet.id = pt.wallet_id
    JOIN public.auctions a ON a.id = wallet.auction_id
    WHERE a.tournament_id = v_tournament_id
      AND pt.player_id = v_player_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DOWNSTREAM_ASSIGNMENTS');
  END IF;

  UPDATE public.player_tournament_registrations
  SET status = 'PENDING',
      reviewed_by = NULL,
      reviewed_at = NULL,
      updated_at = now()
  WHERE id = p_registration_id;

  INSERT INTO public.audit_logs (
    organization_id, tournament_id, user_id, action, entity_type,
    entity_id, before_json, after_json, reason
  ) VALUES (
    v_organization_id, v_tournament_id, v_actor,
    'PLAYER_APPROVAL_REVOKED', 'PLAYER_REGISTRATION', p_registration_id,
    jsonb_build_object('registration_id', p_registration_id, 'player_id', v_player_id, 'status', 'APPROVED'),
    jsonb_build_object('registration_id', p_registration_id, 'player_id', v_player_id, 'status', 'PENDING'),
    v_reason
  );

  RETURN jsonb_build_object('ok', true, 'code', 'PLAYER_APPROVAL_REVOKED');
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_player_approval(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_player_approval(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.revoke_player_approval(uuid, text) TO authenticated;

--------------------------------------------------------------------------------
-- 2. REOPEN REJECTED PLAYER APPLICATION (REJECTED -> PENDING)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reopen_player_registration(
  p_registration_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tournament_id uuid;
  v_organization_id uuid;
  v_player_id uuid;
  v_status text;
  v_reason text := nullif(btrim(p_reason), '');
BEGIN
  SELECT r.tournament_id, t.organization_id, r.player_id, r.status
  INTO v_tournament_id, v_organization_id, v_player_id, v_status
  FROM public.player_tournament_registrations r
  JOIN public.tournaments t ON t.id = r.tournament_id
  WHERE r.id = p_registration_id
  FOR UPDATE OF r;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REGISTRATION_NOT_FOUND');
  END IF;

  IF v_actor IS NULL OR NOT public.is_tournament_organizer(v_tournament_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED');
  END IF;

  IF v_status <> 'REJECTED' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'status', v_status);
  END IF;

  IF v_reason IS NOT NULL AND char_length(v_reason) > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REASON_TOO_LONG');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.team_players tp
    WHERE tp.tournament_id = v_tournament_id
      AND tp.player_id = v_player_id
  ) OR EXISTS (
    SELECT 1
    FROM public.lot_entries le
    JOIN public.lot_sessions ls ON ls.id = le.lot_session_id
    WHERE ls.tournament_id = v_tournament_id
      AND le.player_id = v_player_id
  ) OR EXISTS (
    SELECT 1
    FROM public.auction_players ap
    JOIN public.auctions a ON a.id = ap.auction_id
    WHERE a.tournament_id = v_tournament_id
      AND ap.player_id = v_player_id
  ) OR EXISTS (
    SELECT 1
    FROM public.auction_sales sale
    JOIN public.auction_players ap ON ap.id = sale.auction_player_id
    JOIN public.auctions a ON a.id = ap.auction_id
    WHERE a.tournament_id = v_tournament_id
      AND ap.player_id = v_player_id
  ) OR EXISTS (
    SELECT 1
    FROM public.purse_transactions pt
    JOIN public.auction_team_wallets wallet ON wallet.id = pt.wallet_id
    JOIN public.auctions a ON a.id = wallet.auction_id
    WHERE a.tournament_id = v_tournament_id
      AND pt.player_id = v_player_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DOWNSTREAM_ASSIGNMENTS');
  END IF;

  UPDATE public.player_tournament_registrations
  SET status = 'PENDING',
      reviewed_by = NULL,
      reviewed_at = NULL,
      updated_at = now()
  WHERE id = p_registration_id;

  INSERT INTO public.audit_logs (
    organization_id, tournament_id, user_id, action, entity_type,
    entity_id, before_json, after_json, reason
  ) VALUES (
    v_organization_id, v_tournament_id, v_actor,
    'PLAYER_APPLICATION_REOPENED', 'PLAYER_REGISTRATION', p_registration_id,
    jsonb_build_object('registration_id', p_registration_id, 'player_id', v_player_id, 'status', 'REJECTED'),
    jsonb_build_object('registration_id', p_registration_id, 'player_id', v_player_id, 'status', 'PENDING'),
    v_reason
  );

  RETURN jsonb_build_object('ok', true, 'code', 'PLAYER_APPLICATION_REOPENED');
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_player_registration(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_player_registration(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reopen_player_registration(uuid, text) TO authenticated;
