-- v2: pay registration fees straight to the organizer's UPI ID, no payment provider needed. The player pays in any UPI app,
-- then enters the 12-digit UPI reference (UTR). The organizer checks their own bank or UPI app and confirms or rejects it.
-- Works for player and team registrations alike. Tourny never holds the money. Razorpay (migration 78) stays as an option.

ALTER TABLE public.tournament_settings
  ADD COLUMN upi_id text CHECK (upi_id IS NULL OR upi_id ~ '^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9.-]{1,31}$'),
  ADD COLUMN upi_payee text CHECK (upi_payee IS NULL OR char_length(upi_payee) BETWEEN 1 AND 60);

ALTER TABLE public.registration_payments
  ADD COLUMN utr text CHECK (utr IS NULL OR utr ~ '^[0-9]{12}$');

ALTER TABLE public.registration_payments DROP CONSTRAINT registration_payments_status_check;
ALTER TABLE public.registration_payments ADD CONSTRAINT registration_payments_status_check
  CHECK (status IN ('CREATED', 'SUBMITTED', 'REJECTED', 'PAID', 'WAIVED', 'EXPIRED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED'));
ALTER TABLE public.registration_payments DROP CONSTRAINT registration_payments_provider_check;
ALTER TABLE public.registration_payments ADD CONSTRAINT registration_payments_provider_check CHECK (provider IN ('RAZORPAY', 'MANUAL', 'UPI'));

-- A UTR identifies one bank transaction, so it can back only one live claim (a rejected one frees it).
CREATE UNIQUE INDEX registration_payments_utr_idx ON public.registration_payments (utr)
  WHERE utr IS NOT NULL AND status IN ('SUBMITTED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED');

--------------------------------------------------------------------------------
-- Organizer: where to pay
--------------------------------------------------------------------------------
CREATE FUNCTION public.set_upi_details(p_tournament_id uuid, p_upi_id text, p_payee text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_upi text := NULLIF(btrim(COALESCE(p_upi_id, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v_upi IS NOT NULL AND v_upi !~ '^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9.-]{1,31}$' THEN RAISE EXCEPTION 'That does not look like a UPI ID (for example name@okhdfc)'; END IF;
  UPDATE public.tournament_settings SET upi_id = v_upi, upi_payee = CASE WHEN v_upi IS NULL THEN NULL ELSE NULLIF(left(btrim(COALESCE(p_payee, '')), 60), '') END
  WHERE tournament_id = p_tournament_id;
END;
$$;

-- Fees, whether payment is online or by UPI. The UPI ID itself is only returned to the organizer here; payers get it with their own dues.
CREATE OR REPLACE FUNCTION public.get_registration_fees(p_tournament_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object('player_fee', s.player_registration_fee, 'team_fee', s.team_registration_fee, 'currency', 'INR',
    'online', EXISTS (SELECT 1 FROM public.tournament_payment_accounts a WHERE a.tournament_id = p_tournament_id),
    'upi', s.upi_id IS NOT NULL)
    || CASE WHEN auth.uid() IS NOT NULL AND public.is_tournament_organizer(p_tournament_id)
         THEN jsonb_build_object('upi_id', s.upi_id, 'upi_payee', s.upi_payee) ELSE '{}'::jsonb END
  FROM public.tournament_settings s
  WHERE s.tournament_id = p_tournament_id
    AND (EXISTS (SELECT 1 FROM public.public_tournament_view v WHERE v.id = p_tournament_id) OR public.is_tournament_organizer(p_tournament_id));
$$;

--------------------------------------------------------------------------------
-- Payer: what is owed, and "I have paid" with the reference number
--------------------------------------------------------------------------------
DROP FUNCTION public.my_payments_due();
CREATE FUNCTION public.my_payments_due()
RETURNS TABLE (kind text, registration_id uuid, tournament_id uuid, tournament_name text, label text, amount numeric, online boolean, status text,
               upi_id text, upi_payee text, utr text, note text)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT x.kind, x.id, x.tournament_id, t.name, x.label,
    public.registration_fee(x.tournament_id, x.kind),
    EXISTS (SELECT 1 FROM public.tournament_payment_accounts a WHERE a.tournament_id = x.tournament_id),
    COALESCE(lp.status, 'DUE'),
    s.upi_id, s.upi_payee, lp.utr, CASE WHEN lp.status = 'REJECTED' THEN lp.note END
  FROM (
    SELECT 'PLAYER' AS kind, r.id, r.tournament_id, pp.display_name AS label, r.status
    FROM public.player_tournament_registrations r JOIN public.player_profiles pp ON pp.id = r.player_id WHERE pp.user_id = auth.uid()
    UNION ALL
    SELECT 'TEAM', a.id, a.tournament_id, a.proposed_team_name, a.status FROM public.team_owner_applications a WHERE a.user_id = auth.uid()
  ) x JOIN public.tournaments t ON t.id = x.tournament_id
  JOIN public.tournament_settings s ON s.tournament_id = x.tournament_id
  LEFT JOIN LATERAL (SELECT p.status, p.utr, p.note FROM public.registration_payments p WHERE p.kind = x.kind AND p.registration_id = x.id ORDER BY p.created_at DESC LIMIT 1) lp ON true
  WHERE auth.uid() IS NOT NULL AND x.status IN ('PENDING', 'CHANGES_REQUESTED')
    AND public.registration_fee(x.tournament_id, x.kind) > 0
    AND NOT public.registration_settled(x.kind, x.id, x.tournament_id)
  ORDER BY t.name;
$$;

CREATE FUNCTION public.submit_upi_payment(p_kind text, p_registration_id uuid, p_utr text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tournament uuid;
  v_user uuid;
  v_status text;
  v_utr text := regexp_replace(COALESCE(p_utr, ''), '\s', '', 'g');
  v_fee numeric;
  v_existing uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  SELECT tournament_id, user_id, status INTO v_tournament, v_user, v_status FROM public.registration_owner(p_kind, p_registration_id);
  IF v_tournament IS NULL OR v_user IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Registration not found'; END IF;
  IF v_status NOT IN ('PENDING', 'CHANGES_REQUESTED') THEN RAISE EXCEPTION 'This registration no longer needs a payment'; END IF;
  v_fee := public.registration_fee(v_tournament, p_kind);
  IF v_fee <= 0 THEN RAISE EXCEPTION 'There is no fee for this registration'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tournament_settings WHERE tournament_id = v_tournament AND upi_id IS NOT NULL) THEN RAISE EXCEPTION 'The organizer has not set a UPI ID'; END IF;
  IF public.registration_settled(p_kind, p_registration_id, v_tournament) THEN RAISE EXCEPTION 'This fee is already settled'; END IF;
  IF v_utr !~ '^[0-9]{12}$' THEN RAISE EXCEPTION 'The UPI reference number has 12 digits'; END IF;

  SELECT id INTO v_existing FROM public.registration_payments
  WHERE kind = p_kind AND registration_id = p_registration_id AND provider = 'UPI' AND status IN ('SUBMITTED', 'REJECTED') ORDER BY created_at DESC LIMIT 1;
  BEGIN
    IF v_existing IS NOT NULL THEN
      UPDATE public.registration_payments SET utr = v_utr, status = 'SUBMITTED', note = NULL, amount = v_fee, updated_at = now() WHERE id = v_existing;
    ELSE
      INSERT INTO public.registration_payments (tournament_id, kind, registration_id, payer_user_id, amount, status, provider, utr, created_by)
      VALUES (v_tournament, p_kind, p_registration_id, auth.uid(), v_fee, 'SUBMITTED', 'UPI', v_utr, auth.uid());
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This reference number has already been used for another payment';
  END;
END;
$$;

--------------------------------------------------------------------------------
-- Organizer: confirm or reject what the payer reported, and record a refund sent by hand
--------------------------------------------------------------------------------
CREATE FUNCTION public.review_upi_payment(p_payment_id uuid, p_accept boolean, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tournament uuid;
  v_status text;
BEGIN
  SELECT tournament_id, status INTO v_tournament, v_status FROM public.registration_payments WHERE id = p_payment_id AND provider = 'UPI';
  IF v_tournament IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(v_tournament) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v_status <> 'SUBMITTED' THEN RAISE EXCEPTION 'This payment is not waiting for confirmation'; END IF;
  IF COALESCE(p_accept, false) THEN
    UPDATE public.registration_payments SET status = 'PAID', paid_at = now(), note = left(p_note, 200), updated_at = now() WHERE id = p_payment_id;
  ELSE
    UPDATE public.registration_payments SET status = 'REJECTED', note = left(COALESCE(NULLIF(btrim(p_note), ''), 'The organizer did not receive this payment'), 200), updated_at = now() WHERE id = p_payment_id;
  END IF;
END;
$$;

-- The organizer sent money back themselves (UPI or cash); this only keeps the record.
CREATE FUNCTION public.record_manual_refund(p_payment_id uuid, p_amount numeric DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v record;
  v_amount numeric;
BEGIN
  SELECT * INTO v FROM public.registration_payments WHERE id = p_payment_id AND provider IN ('UPI', 'MANUAL');
  IF v.id IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(v.tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v.status NOT IN ('PAID', 'PARTIALLY_REFUNDED') THEN RAISE EXCEPTION 'Only a paid registration can be refunded'; END IF;
  v_amount := round(COALESCE(p_amount, v.amount - v.refunded_amount), 2);
  IF v_amount <= 0 OR v_amount > v.amount - v.refunded_amount THEN RAISE EXCEPTION 'The refund cannot be more than what is left to refund'; END IF;
  UPDATE public.registration_payments
  SET refunded_amount = refunded_amount + v_amount,
      status = CASE WHEN refunded_amount + v_amount >= amount THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END,
      note = COALESCE(left(p_note, 200), note), updated_at = now()
  WHERE id = p_payment_id;
END;
$$;

--------------------------------------------------------------------------------
-- Organizer's list: now with the reference number
--------------------------------------------------------------------------------
DROP FUNCTION public.list_registration_payments(uuid);
CREATE FUNCTION public.list_registration_payments(p_tournament_id uuid)
RETURNS TABLE (kind text, registration_id uuid, payment_id uuid, status text, amount numeric, provider text, refunded_amount numeric, paid_at timestamptz, note text, label text, utr text)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY
  SELECT DISTINCT ON (p.kind, p.registration_id) p.kind, p.registration_id, p.id, p.status, p.amount, p.provider, p.refunded_amount, p.paid_at, p.note,
    (SELECT o.label FROM public.registration_owner(p.kind, p.registration_id) o LIMIT 1), p.utr
  FROM public.registration_payments p WHERE p.tournament_id = p_tournament_id
  ORDER BY p.kind, p.registration_id, p.created_at DESC;
END;
$$;

-- Marking paid or waived by hand also closes a UPI claim that was waiting.
CREATE OR REPLACE FUNCTION public.mark_registration_paid(p_kind text, p_registration_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tournament uuid;
  v_user uuid;
BEGIN
  SELECT tournament_id, user_id INTO v_tournament, v_user FROM public.registration_owner(p_kind, p_registration_id);
  IF v_tournament IS NULL THEN RAISE EXCEPTION 'Registration not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(v_tournament) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_status NOT IN ('PAID', 'WAIVED') THEN RAISE EXCEPTION 'Choose paid or waived'; END IF;
  UPDATE public.registration_payments SET status = 'CANCELLED', updated_at = now() WHERE kind = p_kind AND registration_id = p_registration_id AND status IN ('CREATED', 'SUBMITTED');
  INSERT INTO public.registration_payments (tournament_id, kind, registration_id, payer_user_id, amount, status, provider, note, created_by, paid_at)
  VALUES (v_tournament, p_kind, p_registration_id, v_user, CASE WHEN p_status = 'PAID' THEN public.registration_fee(v_tournament, p_kind) ELSE 0 END, p_status, 'MANUAL', left(p_note, 200), auth.uid(), now());
END;
$$;

REVOKE ALL ON FUNCTION public.set_upi_details(uuid, text, text), public.my_payments_due(), public.submit_upi_payment(text, uuid, text),
  public.review_upi_payment(uuid, boolean, text), public.record_manual_refund(uuid, numeric, text), public.list_registration_payments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_upi_details(uuid, text, text), public.my_payments_due(), public.submit_upi_payment(text, uuid, text),
  public.review_upi_payment(uuid, boolean, text), public.record_manual_refund(uuid, numeric, text), public.list_registration_payments(uuid) TO authenticated;
