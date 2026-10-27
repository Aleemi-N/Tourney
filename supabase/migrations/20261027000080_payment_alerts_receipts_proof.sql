-- v2: finishing touches for registration fees.
--  * Push alerts: the organizer hears when a payment needs confirming (or an online payment arrived); the payer hears
--    when it is confirmed, not received, or waived.
--  * Reminders: payers who still owe a fee, and organizers with payments waiting too long (sent by the API on a timer).
--  * Receipts: a confirmed payment can be shown and shared by the payer and the organizer.
--  * Proof: the payer may attach a screenshot of the UPI payment, which only the payer and the organizers can read.

ALTER TABLE public.registration_payments
  ADD COLUMN proof_image bytea,
  ADD COLUMN proof_type text CHECK (proof_type IN ('image/jpeg', 'image/png')),
  ADD CONSTRAINT registration_payments_proof_size CHECK (proof_image IS NULL OR octet_length(proof_image) <= 1500000);

--------------------------------------------------------------------------------
-- Alerts
--------------------------------------------------------------------------------
CREATE FUNCTION public.push_payment_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_label text;
  v_tournament text;
  v_amount text := to_char(NEW.amount, 'FM999999990.##');
  v_organizers uuid[];
  v_changed boolean := TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status;
BEGIN
  SELECT o.label INTO v_label FROM public.registration_owner(NEW.kind, NEW.registration_id) o LIMIT 1;
  SELECT t.name INTO v_tournament FROM public.tournaments t WHERE t.id = NEW.tournament_id;
  v_label := COALESCE(v_label, 'A registration');
  SELECT COALESCE(array_agg(m.user_id), '{}') INTO v_organizers FROM public.tournament_members m
  WHERE m.tournament_id = NEW.tournament_id AND m.role = 'ORGANIZER' AND m.status = 'ACTIVE';

  IF NEW.status = 'SUBMITTED' AND (v_changed OR OLD.utr IS DISTINCT FROM NEW.utr) THEN
    PERFORM public.enqueue_push(v_organizers, 'UPI payment to confirm',
      format('%s says they paid ₹%s for %s (reference %s). Check your UPI app, then confirm.', v_label, v_amount, v_tournament, NEW.utr),
      jsonb_build_object('kind', 'PAYMENT_SUBMITTED', 'tournamentId', NEW.tournament_id));
  ELSIF NEW.status = 'PAID' AND v_changed THEN
    IF NEW.provider = 'RAZORPAY' THEN
      PERFORM public.enqueue_push(v_organizers, 'Payment received', format('%s paid ₹%s for %s.', v_label, v_amount, v_tournament),
        jsonb_build_object('kind', 'PAYMENT_RECEIVED', 'tournamentId', NEW.tournament_id));
    END IF;
    PERFORM public.enqueue_push(ARRAY[NEW.payer_user_id], 'Payment confirmed', format('Your ₹%s fee for %s is confirmed.', v_amount, v_tournament),
      jsonb_build_object('kind', 'PAYMENT_CONFIRMED', 'tournamentId', NEW.tournament_id, 'paymentId', NEW.id));
  ELSIF NEW.status = 'REJECTED' AND v_changed THEN
    PERFORM public.enqueue_push(ARRAY[NEW.payer_user_id], 'Payment not received',
      format('The organizer of %s did not receive your payment. Check the reference number and send it again.', v_tournament),
      jsonb_build_object('kind', 'PAYMENT_REJECTED', 'tournamentId', NEW.tournament_id));
  ELSIF NEW.status = 'WAIVED' AND v_changed THEN
    PERFORM public.enqueue_push(ARRAY[NEW.payer_user_id], 'Fee waived', format('The organizer of %s waived your registration fee.', v_tournament),
      jsonb_build_object('kind', 'PAYMENT_CONFIRMED', 'tournamentId', NEW.tournament_id));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.push_payment_events() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER push_payment_events AFTER INSERT OR UPDATE OF status, utr ON public.registration_payments FOR EACH ROW EXECUTE FUNCTION public.push_payment_events();

--------------------------------------------------------------------------------
-- Reminders (the API runs send_payment_reminders every half hour)
--------------------------------------------------------------------------------
CREATE TABLE public.payment_reminders (
  kind text NOT NULL,           -- PLAYER / TEAM (a registration still owing a fee) or ORGANIZER (payments waiting in a tournament)
  registration_id uuid NOT NULL, -- the registration, or the tournament for ORGANIZER
  times integer NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, registration_id)
);
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_reminders FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.send_payment_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  r record;
  v_sent integer := 0;
BEGIN
  -- A payer who registered over a day ago and still owes the fee: at most 3 reminders, 3 days apart.
  FOR r IN
    SELECT x.kind, x.id, x.user_id, x.label, t.name AS tname, t.id AS tid, public.registration_fee(x.tournament_id, x.kind) AS fee
    FROM (
      SELECT 'PLAYER' AS kind, g.id, g.tournament_id, pp.user_id, pp.display_name AS label, g.status, g.created_at
      FROM public.player_tournament_registrations g JOIN public.player_profiles pp ON pp.id = g.player_id
      UNION ALL
      SELECT 'TEAM', a.id, a.tournament_id, a.user_id, a.proposed_team_name, a.status, a.created_at FROM public.team_owner_applications a
    ) x
    JOIN public.tournaments t ON t.id = x.tournament_id
    LEFT JOIN public.payment_reminders pr ON pr.kind = x.kind AND pr.registration_id = x.id
    WHERE x.status IN ('PENDING', 'CHANGES_REQUESTED') AND t.status IN ('REGISTRATION', 'PREPARATION')
      AND x.created_at < now() - interval '24 hours'
      AND public.registration_fee(x.tournament_id, x.kind) > 0
      AND NOT public.registration_settled(x.kind, x.id, x.tournament_id)
      AND NOT EXISTS (SELECT 1 FROM public.registration_payments p WHERE p.kind = x.kind AND p.registration_id = x.id AND p.status = 'SUBMITTED')
      AND (pr.sent_at IS NULL OR (pr.times < 3 AND pr.sent_at < now() - interval '72 hours'))
  LOOP
    PERFORM public.enqueue_push(ARRAY[r.user_id], 'Registration fee still due',
      format('%s: pay ₹%s for %s so the organizer can approve your registration.', r.label, to_char(r.fee, 'FM999999990.##'), r.tname),
      jsonb_build_object('kind', 'PAYMENT_DUE', 'tournamentId', r.tid));
    INSERT INTO public.payment_reminders (kind, registration_id, times, sent_at) VALUES (r.kind, r.id, 1, now())
    ON CONFLICT (kind, registration_id) DO UPDATE SET times = public.payment_reminders.times + 1, sent_at = now();
    v_sent := v_sent + 1;
  END LOOP;

  -- An organizer with UPI payments waiting more than half a day: once a day.
  FOR r IN
    SELECT p.tournament_id, count(*) AS c, t.name AS tname
    FROM public.registration_payments p JOIN public.tournaments t ON t.id = p.tournament_id
    LEFT JOIN public.payment_reminders pr ON pr.kind = 'ORGANIZER' AND pr.registration_id = p.tournament_id
    WHERE p.status = 'SUBMITTED' AND p.updated_at < now() - interval '12 hours' AND (pr.sent_at IS NULL OR pr.sent_at < now() - interval '24 hours')
    GROUP BY p.tournament_id, t.name
  LOOP
    PERFORM public.enqueue_push(
      (SELECT COALESCE(array_agg(m.user_id), '{}') FROM public.tournament_members m WHERE m.tournament_id = r.tournament_id AND m.role = 'ORGANIZER' AND m.status = 'ACTIVE'),
      'Payments waiting for you', format('%s UPI payment%s waiting to be confirmed in %s.', r.c, CASE WHEN r.c = 1 THEN ' is' ELSE 's are' END, r.tname),
      jsonb_build_object('kind', 'PAYMENT_SUBMITTED', 'tournamentId', r.tournament_id));
    INSERT INTO public.payment_reminders (kind, registration_id, times, sent_at) VALUES ('ORGANIZER', r.tournament_id, 1, now())
    ON CONFLICT (kind, registration_id) DO UPDATE SET times = public.payment_reminders.times + 1, sent_at = now();
    v_sent := v_sent + 1;
  END LOOP;
  RETURN v_sent;
END;
$$;
REVOKE ALL ON FUNCTION public.send_payment_reminders() FROM PUBLIC, anon, authenticated;

--------------------------------------------------------------------------------
-- Proof: submit_upi_payment takes an optional screenshot (base64, JPEG or PNG, up to 1.5 MB)
--------------------------------------------------------------------------------
DROP FUNCTION public.submit_upi_payment(text, uuid, text);
CREATE FUNCTION public.submit_upi_payment(p_kind text, p_registration_id uuid, p_utr text, p_proof text DEFAULT NULL)
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
  v_bytes bytea;
  v_type text;
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

  IF COALESCE(p_proof, '') <> '' THEN
    BEGIN
      v_bytes := decode(regexp_replace(p_proof, '^data:[^,]*,', ''), 'base64');
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'The screenshot could not be read';
    END;
    IF octet_length(v_bytes) > 1500000 THEN RAISE EXCEPTION 'The screenshot is too large (up to 1.5 MB)'; END IF;
    IF substring(v_bytes FROM 1 FOR 3) = '\xffd8ff'::bytea THEN v_type := 'image/jpeg';
    ELSIF substring(v_bytes FROM 1 FOR 4) = '\x89504e47'::bytea THEN v_type := 'image/png';
    ELSE RAISE EXCEPTION 'Attach a JPEG or PNG screenshot';
    END IF;
  END IF;

  SELECT id INTO v_existing FROM public.registration_payments
  WHERE kind = p_kind AND registration_id = p_registration_id AND provider = 'UPI' AND status IN ('SUBMITTED', 'REJECTED') ORDER BY created_at DESC LIMIT 1;
  BEGIN
    IF v_existing IS NOT NULL THEN
      UPDATE public.registration_payments
      SET utr = v_utr, status = 'SUBMITTED', note = NULL, amount = v_fee, updated_at = now(),
          proof_image = COALESCE(v_bytes, proof_image), proof_type = COALESCE(v_type, proof_type)
      WHERE id = v_existing;
    ELSE
      INSERT INTO public.registration_payments (tournament_id, kind, registration_id, payer_user_id, amount, status, provider, utr, created_by, proof_image, proof_type)
      VALUES (v_tournament, p_kind, p_registration_id, auth.uid(), v_fee, 'SUBMITTED', 'UPI', v_utr, auth.uid(), v_bytes, v_type);
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This reference number has already been used for another payment';
  END;
END;
$$;

-- The screenshot of one payment, as a data URL. Only the payer and the tournament's organizers can read it.
CREATE FUNCTION public.get_payment_proof(p_payment_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  p public.registration_payments;
BEGIN
  SELECT * INTO p FROM public.registration_payments WHERE id = p_payment_id;
  IF p.id IS NULL OR auth.uid() IS NULL OR NOT (p.payer_user_id = auth.uid() OR public.is_tournament_organizer(p.tournament_id)) THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF p.proof_image IS NULL THEN RETURN NULL; END IF;
  RETURN 'data:' || p.proof_type || ';base64,' || translate(encode(p.proof_image, 'base64'), E'\n', '');
END;
$$;

--------------------------------------------------------------------------------
-- Lists now say whether a screenshot is attached
--------------------------------------------------------------------------------
DROP FUNCTION public.my_payments_due();
CREATE FUNCTION public.my_payments_due()
RETURNS TABLE (kind text, registration_id uuid, tournament_id uuid, tournament_name text, label text, amount numeric, online boolean, status text,
               upi_id text, upi_payee text, utr text, note text, payment_id uuid, has_proof boolean)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT x.kind, x.id, x.tournament_id, t.name, x.label,
    public.registration_fee(x.tournament_id, x.kind),
    EXISTS (SELECT 1 FROM public.tournament_payment_accounts a WHERE a.tournament_id = x.tournament_id),
    COALESCE(lp.status, 'DUE'),
    s.upi_id, s.upi_payee, lp.utr, CASE WHEN lp.status = 'REJECTED' THEN lp.note END, lp.id, COALESCE(lp.has_proof, false)
  FROM (
    SELECT 'PLAYER' AS kind, r.id, r.tournament_id, pp.display_name AS label, r.status
    FROM public.player_tournament_registrations r JOIN public.player_profiles pp ON pp.id = r.player_id WHERE pp.user_id = auth.uid()
    UNION ALL
    SELECT 'TEAM', a.id, a.tournament_id, a.proposed_team_name, a.status FROM public.team_owner_applications a WHERE a.user_id = auth.uid()
  ) x JOIN public.tournaments t ON t.id = x.tournament_id
  JOIN public.tournament_settings s ON s.tournament_id = x.tournament_id
  LEFT JOIN LATERAL (SELECT p.id, p.status, p.utr, p.note, p.proof_image IS NOT NULL AS has_proof FROM public.registration_payments p WHERE p.kind = x.kind AND p.registration_id = x.id ORDER BY p.created_at DESC LIMIT 1) lp ON true
  WHERE auth.uid() IS NOT NULL AND x.status IN ('PENDING', 'CHANGES_REQUESTED')
    AND public.registration_fee(x.tournament_id, x.kind) > 0
    AND NOT public.registration_settled(x.kind, x.id, x.tournament_id)
  ORDER BY t.name;
$$;

DROP FUNCTION public.list_registration_payments(uuid);
CREATE FUNCTION public.list_registration_payments(p_tournament_id uuid)
RETURNS TABLE (kind text, registration_id uuid, payment_id uuid, status text, amount numeric, provider text, refunded_amount numeric, paid_at timestamptz, note text, label text, utr text, has_proof boolean)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY
  SELECT DISTINCT ON (p.kind, p.registration_id) p.kind, p.registration_id, p.id, p.status, p.amount, p.provider, p.refunded_amount, p.paid_at, p.note,
    (SELECT o.label FROM public.registration_owner(p.kind, p.registration_id) o LIMIT 1), p.utr, p.proof_image IS NOT NULL
  FROM public.registration_payments p WHERE p.tournament_id = p_tournament_id
  ORDER BY p.kind, p.registration_id, p.created_at DESC;
END;
$$;

--------------------------------------------------------------------------------
-- Receipts
--------------------------------------------------------------------------------
CREATE FUNCTION public.get_payment_receipt(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  p public.registration_payments;
  v jsonb;
BEGIN
  SELECT * INTO p FROM public.registration_payments WHERE id = p_payment_id;
  IF p.id IS NULL OR auth.uid() IS NULL OR NOT (p.payer_user_id = auth.uid() OR public.is_tournament_organizer(p.tournament_id)) THEN RAISE EXCEPTION 'Receipt not found'; END IF;
  IF p.status NOT IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') THEN RAISE EXCEPTION 'There is no receipt for this payment yet'; END IF;
  SELECT jsonb_build_object(
    'receipt_no', 'TRN-' || upper(left(replace(p.id::text, '-', ''), 8)),
    'tournament', t.name, 'name', (SELECT o.label FROM public.registration_owner(p.kind, p.registration_id) o LIMIT 1), 'kind', p.kind,
    'amount', p.amount, 'refunded_amount', p.refunded_amount, 'status', p.status, 'currency', p.currency,
    'method', CASE p.provider WHEN 'UPI' THEN 'UPI' WHEN 'RAZORPAY' THEN 'Razorpay' ELSE 'Paid to the organizer' END,
    'reference', COALESCE(p.utr, p.provider_payment_id), 'paid_at', p.paid_at,
    'paid_to', CASE WHEN p.provider = 'UPI' THEN s.upi_payee END)
  INTO v
  FROM public.tournaments t LEFT JOIN public.tournament_settings s ON s.tournament_id = t.id WHERE t.id = p.tournament_id;
  RETURN v;
END;
$$;

CREATE FUNCTION public.my_payment_receipts()
RETURNS TABLE (payment_id uuid, tournament_name text, label text, kind text, amount numeric, refunded_amount numeric, status text, paid_at timestamptz, method text)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p.id, t.name, (SELECT o.label FROM public.registration_owner(p.kind, p.registration_id) o LIMIT 1), p.kind, p.amount, p.refunded_amount, p.status, p.paid_at,
    CASE p.provider WHEN 'UPI' THEN 'UPI' WHEN 'RAZORPAY' THEN 'Razorpay' ELSE 'Paid to the organizer' END
  FROM public.registration_payments p JOIN public.tournaments t ON t.id = p.tournament_id
  WHERE auth.uid() IS NOT NULL AND p.payer_user_id = auth.uid() AND p.status IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED')
  ORDER BY p.paid_at DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.submit_upi_payment(text, uuid, text, text), public.get_payment_proof(uuid), public.my_payments_due(), public.list_registration_payments(uuid),
  public.get_payment_receipt(uuid), public.my_payment_receipts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_upi_payment(text, uuid, text, text), public.get_payment_proof(uuid), public.my_payments_due(), public.list_registration_payments(uuid),
  public.get_payment_receipt(uuid), public.my_payment_receipts() TO authenticated;
