-- v2: fixes from the code review of migrations 78-85.
--  * People on the player waitlist are no longer asked to pay (or reminded), and cannot submit a payment, until they have a place.
--  * Waitlist upkeep runs once per statement instead of once per row, and approving the last places takes a lock on the
--    tournament's settings so two approvals cannot both pass the player limit.
--  * Every refund is its own record with its own date (the ledger used the payment's updated_at, which moves on any later update).
--  * The finance summary builds the ledger once; my_certificates only looks at tournaments the caller's players took part in.

--------------------------------------------------------------------------------
-- Waitlisted registrations do not pay yet
--------------------------------------------------------------------------------
CREATE FUNCTION public.registration_waitlisted(p_kind text, p_registration_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_kind = 'PLAYER' AND EXISTS (SELECT 1 FROM public.player_tournament_registrations r WHERE r.id = p_registration_id AND r.waitlist_position IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.registration_waitlisted(text, uuid) FROM PUBLIC, anon, authenticated;

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
    AND NOT public.registration_waitlisted(x.kind, x.id)
  ORDER BY t.name;
$$;


REVOKE ALL ON FUNCTION public.my_payments_due() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_payments_due() TO authenticated;

CREATE OR REPLACE FUNCTION public.send_payment_reminders()
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
      AND NOT public.registration_waitlisted(x.kind, x.id)
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

CREATE OR REPLACE FUNCTION public.submit_upi_payment(p_kind text, p_registration_id uuid, p_utr text, p_proof text DEFAULT NULL)
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
  IF public.registration_waitlisted(p_kind, p_registration_id) THEN RAISE EXCEPTION 'You are on the waitlist. You can pay when a place opens up.'; END IF;
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


--------------------------------------------------------------------------------
-- Waitlist upkeep once per statement; a lock for the last places
--------------------------------------------------------------------------------
DROP TRIGGER refresh_waitlist ON public.player_tournament_registrations;

CREATE FUNCTION public.refresh_waitlist_statement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tournament uuid;
BEGIN
  -- refresh_waitlist itself updates registrations; do not run again for that nested statement.
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  FOR v_tournament IN SELECT DISTINCT tournament_id FROM new_rows LOOP
    PERFORM public.refresh_waitlist(v_tournament);
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_waitlist_statement() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER refresh_waitlist_insert AFTER INSERT ON public.player_tournament_registrations REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_waitlist_statement();
CREATE TRIGGER refresh_waitlist_update AFTER UPDATE ON public.player_tournament_registrations REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.refresh_waitlist_statement();

CREATE OR REPLACE FUNCTION public.check_player_approval_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_max integer;
BEGIN
  IF NEW.status = 'APPROVED' AND OLD.status IS DISTINCT FROM 'APPROVED' THEN
    -- Two approvals at once must not both see a free place: the second waits here and then counts the first.
    SELECT max_players INTO v_max FROM public.tournament_settings WHERE tournament_id = NEW.tournament_id FOR UPDATE;
    IF v_max IS NOT NULL AND (SELECT count(*) FROM public.player_tournament_registrations WHERE tournament_id = NEW.tournament_id AND status = 'APPROVED' AND id <> NEW.id) >= v_max THEN
      RAISE EXCEPTION 'The tournament is full (% players). Raise the player limit to approve more.', v_max;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_player_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  s public.tournament_settings;
  v_dob date;
  v_staff boolean := auth.uid() IS NOT NULL AND public.is_tournament_organizer(NEW.tournament_id);
BEGIN
  SELECT * INTO s FROM public.tournament_settings WHERE tournament_id = NEW.tournament_id;
  IF NOT v_staff THEN
    IF s.registration_closes_at IS NOT NULL AND now() > s.registration_closes_at THEN RAISE EXCEPTION 'Registration for this tournament has closed'; END IF;
    IF s.born_on_or_after IS NOT NULL OR s.born_on_or_before IS NOT NULL THEN
      SELECT date_of_birth INTO v_dob FROM public.player_profiles WHERE id = NEW.player_id;
      IF v_dob IS NULL THEN RAISE EXCEPTION 'This tournament has an age category, so your date of birth is needed. Add it to your profile.'; END IF;
      IF s.born_on_or_after IS NOT NULL AND v_dob < s.born_on_or_after THEN RAISE EXCEPTION 'Players for this tournament must be born on or after %', to_char(s.born_on_or_after, 'DD Mon YYYY'); END IF;
      IF s.born_on_or_before IS NOT NULL AND v_dob > s.born_on_or_before THEN RAISE EXCEPTION 'Players for this tournament must be born on or before %', to_char(s.born_on_or_before, 'DD Mon YYYY'); END IF;
    END IF;
  END IF;
  IF NEW.status = 'APPROVED' AND s.max_players IS NOT NULL THEN
    PERFORM 1 FROM public.tournament_settings WHERE tournament_id = NEW.tournament_id FOR UPDATE;
    IF (SELECT count(*) FROM public.player_tournament_registrations WHERE tournament_id = NEW.tournament_id AND status = 'APPROVED') >= s.max_players THEN
      RAISE EXCEPTION 'The tournament is full (% players). Raise the player limit to approve more.', s.max_players;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

--------------------------------------------------------------------------------
-- Refunds are records of their own
--------------------------------------------------------------------------------
CREATE TABLE public.payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.registration_payments(id) ON DELETE CASCADE,
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_refunds_tournament_idx ON public.payment_refunds (tournament_id, created_at);
ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_refunds FROM PUBLIC, anon, authenticated;
INSERT INTO public.payment_refunds (payment_id, tournament_id, amount, created_at)
SELECT id, tournament_id, refunded_amount, updated_at FROM public.registration_payments WHERE refunded_amount > 0;

CREATE FUNCTION public.record_refund_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_before numeric := CASE WHEN TG_OP = 'UPDATE' THEN OLD.refunded_amount ELSE 0 END;
BEGIN
  IF NEW.refunded_amount > v_before THEN
    INSERT INTO public.payment_refunds (payment_id, tournament_id, amount) VALUES (NEW.id, NEW.tournament_id, NEW.refunded_amount - v_before);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.record_refund_event() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER record_refund_event AFTER INSERT OR UPDATE OF refunded_amount ON public.registration_payments FOR EACH ROW EXECUTE FUNCTION public.record_refund_event();

CREATE OR REPLACE FUNCTION public.get_finance_ledger(p_tournament_id uuid)
RETURNS TABLE (source text, id uuid, kind text, category text, amount numeric, occurred_on date, description text, party text,
               has_attachment boolean, voided boolean, void_note text, created_by_name text, created_at timestamptz)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_zone text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT COALESCE(s.timezone, 'UTC') INTO v_zone FROM public.tournament_settings s WHERE s.tournament_id = p_tournament_id;
  v_zone := COALESCE(v_zone, 'UTC');
  RETURN QUERY
  SELECT * FROM (
    SELECT 'ENTRY'::text AS source, e.id, e.kind, e.category, e.amount, e.occurred_on, e.description, e.party, e.attachment IS NOT NULL AS has_attachment,
           e.voided_at IS NOT NULL AS voided,
           CASE WHEN e.voided_at IS NOT NULL THEN 'Voided ' || to_char(e.voided_at AT TIME ZONE v_zone, 'DD Mon YYYY') END AS void_note,
           (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = e.created_by) AS created_by_name, e.created_at
    FROM public.finance_entries e WHERE e.tournament_id = p_tournament_id
    UNION ALL
    SELECT 'FEE', p.id, 'INCOME', 'Registration fees', p.amount, (p.paid_at AT TIME ZONE v_zone)::date,
           'Registration fee: ' || COALESCE((SELECT o.label FROM public.registration_owner(p.kind, p.registration_id) o LIMIT 1), 'registration')
             || ' (' || CASE p.provider WHEN 'UPI' THEN 'UPI' WHEN 'RAZORPAY' THEN 'Razorpay' ELSE 'paid to the organizer' END || ')',
           NULL::text, false, false, NULL::text, NULL::text, p.paid_at
    FROM public.registration_payments p WHERE p.tournament_id = p_tournament_id AND p.status IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') AND p.paid_at IS NOT NULL AND p.amount > 0
    UNION ALL
    SELECT 'REFUND', r.id, 'EXPENSE', 'Refunds', r.amount, (r.created_at AT TIME ZONE v_zone)::date,
           'Refund: ' || COALESCE((SELECT o.label FROM public.registration_owner(p.kind, p.registration_id) o LIMIT 1), 'registration'),
           NULL::text, false, false, NULL::text, NULL::text, r.created_at
    FROM public.payment_refunds r JOIN public.registration_payments p ON p.id = r.payment_id WHERE r.tournament_id = p_tournament_id
  ) x
  ORDER BY x.occurred_on DESC, x.created_at DESC;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_finance_summary(p_tournament_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_summary jsonb;
  v_pending numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT COALESCE(sum(amount), 0) INTO v_pending FROM public.registration_payments WHERE tournament_id = p_tournament_id AND status = 'SUBMITTED';
  -- The ledger is read once; the totals and the categories are both worked out from it.
  WITH l AS MATERIALIZED (SELECT * FROM public.get_finance_ledger(p_tournament_id) WHERE NOT voided),
       t AS (SELECT COALESCE(sum(amount) FILTER (WHERE kind = 'INCOME'), 0) AS income, COALESCE(sum(amount) FILTER (WHERE kind = 'EXPENSE'), 0) AS expense,
                    COALESCE(sum(amount) FILTER (WHERE source = 'FEE'), 0) AS fees, COALESCE(sum(amount) FILTER (WHERE source = 'REFUND'), 0) AS refunds FROM l),
       c AS (SELECT kind, category, sum(amount) AS total FROM l GROUP BY kind, category)
  SELECT jsonb_build_object('income', t.income, 'expense', t.expense, 'net', t.income - t.expense, 'fees_collected', t.fees, 'refunds', t.refunds,
           'awaiting_confirmation', v_pending,
           'by_category', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', c.kind, 'category', c.category, 'total', c.total) ORDER BY c.kind DESC, c.total DESC) FROM c), '[]'::jsonb))
  INTO v_summary FROM t;
  RETURN v_summary;
END;
$$;

--------------------------------------------------------------------------------
-- My certificates: only the tournaments the caller's players belong to
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_certificates()
RETURNS TABLE (tournament_id uuid, cert_key text, kind text, title text, recipient text, team_name text, detail text, awarded_on date, tournament_name text, tournament_slug text)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH mine AS (SELECT pp.id FROM public.player_profiles pp WHERE pp.user_id = auth.uid()),
       mine_t AS (
         SELECT r.tournament_id FROM public.player_tournament_registrations r WHERE r.player_id IN (SELECT id FROM mine)
         UNION
         SELECT tp.tournament_id FROM public.team_players tp WHERE tp.player_id IN (SELECT id FROM mine))
  SELECT t.id, c.cert_key, c.kind, c.title, c.recipient, c.team_name, c.detail, c.awarded_on, c.tournament_name, c.tournament_slug
  FROM public.tournaments t CROSS JOIN LATERAL public.get_certificates(t.id) c
  WHERE auth.uid() IS NOT NULL AND t.id IN (SELECT tournament_id FROM mine_t) AND t.is_public AND t.status IN ('COMPLETED', 'ARCHIVED')
    AND c.player_id IN (SELECT id FROM mine)
  ORDER BY t.end_date DESC NULLS LAST, c.kind;
$$;
