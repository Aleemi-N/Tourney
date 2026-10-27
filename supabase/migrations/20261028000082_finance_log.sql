-- v2: an income and expense log per tournament, for the organizers only.
-- Registration fees that were paid (and refunds) appear in it automatically from the payment records; the organizer adds
-- everything else by hand (sponsorship, venue, referees, trophies ...), optionally with a photo of the bill. Entries are
-- never deleted: an entry is voided (kept, struck through, left out of the totals) and every change is written to audit_logs.

CREATE TABLE public.finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('INCOME', 'EXPENSE')),
  category text NOT NULL CHECK (char_length(category) BETWEEN 1 AND 40),
  amount numeric(12,2) NOT NULL CHECK (amount > 0 AND amount <= 100000000),
  occurred_on date NOT NULL,
  description text CHECK (description IS NULL OR char_length(description) <= 200),
  party text CHECK (party IS NULL OR char_length(party) <= 100),
  attachment bytea,
  attachment_type text CHECK (attachment_type IN ('image/jpeg', 'image/png')),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid REFERENCES public.profiles(id),
  CONSTRAINT finance_entries_attachment_size CHECK (attachment IS NULL OR octet_length(attachment) <= 1500000)
);
CREATE INDEX finance_entries_tournament_idx ON public.finance_entries (tournament_id, occurred_on DESC, created_at DESC);
ALTER TABLE public.finance_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_entries FROM PUBLIC, anon, authenticated;

--------------------------------------------------------------------------------
-- Add or change an entry
--------------------------------------------------------------------------------
CREATE FUNCTION public.save_finance_entry(
  p_tournament_id uuid, p_id uuid, p_kind text, p_category text, p_amount numeric, p_date date,
  p_description text DEFAULT NULL, p_party text DEFAULT NULL, p_attachment text DEFAULT NULL, p_remove_attachment boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid := p_id;
  v_old public.finance_entries;
  v_category text := btrim(COALESCE(p_category, ''));
  v_amount numeric := round(COALESCE(p_amount, 0), 2);
  v_bytes bytea;
  v_type text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_kind NOT IN ('INCOME', 'EXPENSE') THEN RAISE EXCEPTION 'Choose income or expense'; END IF;
  IF v_category = '' OR char_length(v_category) > 40 THEN RAISE EXCEPTION 'Choose a category (up to 40 characters)'; END IF;
  IF v_amount <= 0 OR v_amount > 100000000 THEN RAISE EXCEPTION 'Enter an amount above zero'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'Enter the date'; END IF;
  IF COALESCE(p_attachment, '') <> '' THEN
    BEGIN
      v_bytes := decode(regexp_replace(p_attachment, '^data:[^,]*,', ''), 'base64');
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'The photo could not be read';
    END;
    IF octet_length(v_bytes) > 1500000 THEN RAISE EXCEPTION 'The photo is too large (up to 1.5 MB)'; END IF;
    IF substring(v_bytes FROM 1 FOR 3) = '\xffd8ff'::bytea THEN v_type := 'image/jpeg';
    ELSIF substring(v_bytes FROM 1 FOR 4) = '\x89504e47'::bytea THEN v_type := 'image/png';
    ELSE RAISE EXCEPTION 'Attach a JPEG or PNG photo';
    END IF;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.finance_entries (tournament_id, kind, category, amount, occurred_on, description, party, attachment, attachment_type, created_by, updated_by)
    VALUES (p_tournament_id, p_kind, v_category, v_amount, p_date, NULLIF(btrim(COALESCE(p_description, '')), ''), NULLIF(btrim(COALESCE(p_party, '')), ''), v_bytes, v_type, auth.uid(), auth.uid())
    RETURNING id INTO v_id;
    INSERT INTO public.audit_logs (tournament_id, user_id, action, entity_type, entity_id, after_json)
    VALUES (p_tournament_id, auth.uid(), 'FINANCE_ENTRY_ADDED', 'FINANCE_ENTRY', v_id,
      jsonb_build_object('kind', p_kind, 'category', v_category, 'amount', v_amount, 'date', p_date, 'description', p_description, 'party', p_party));
  ELSE
    SELECT * INTO v_old FROM public.finance_entries WHERE id = v_id AND tournament_id = p_tournament_id;
    IF v_old.id IS NULL THEN RAISE EXCEPTION 'Entry not found'; END IF;
    IF v_old.voided_at IS NOT NULL THEN RAISE EXCEPTION 'A voided entry cannot be changed. Restore it first.'; END IF;
    UPDATE public.finance_entries SET kind = p_kind, category = v_category, amount = v_amount, occurred_on = p_date,
      description = NULLIF(btrim(COALESCE(p_description, '')), ''), party = NULLIF(btrim(COALESCE(p_party, '')), ''),
      attachment = CASE WHEN v_bytes IS NOT NULL THEN v_bytes WHEN p_remove_attachment THEN NULL ELSE attachment END,
      attachment_type = CASE WHEN v_type IS NOT NULL THEN v_type WHEN p_remove_attachment THEN NULL ELSE attachment_type END,
      updated_by = auth.uid(), updated_at = now()
    WHERE id = v_id;
    INSERT INTO public.audit_logs (tournament_id, user_id, action, entity_type, entity_id, before_json, after_json)
    VALUES (p_tournament_id, auth.uid(), 'FINANCE_ENTRY_EDITED', 'FINANCE_ENTRY', v_id,
      jsonb_build_object('kind', v_old.kind, 'category', v_old.category, 'amount', v_old.amount, 'date', v_old.occurred_on, 'description', v_old.description, 'party', v_old.party),
      jsonb_build_object('kind', p_kind, 'category', v_category, 'amount', v_amount, 'date', p_date, 'description', p_description, 'party', p_party));
  END IF;
  RETURN v_id;
END;
$$;

-- Voiding keeps the entry in the log but out of the totals; restoring brings it back.
CREATE FUNCTION public.void_finance_entry(p_id uuid, p_void boolean DEFAULT true, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_entry public.finance_entries;
BEGIN
  SELECT * INTO v_entry FROM public.finance_entries WHERE id = p_id;
  IF v_entry.id IS NULL THEN RAISE EXCEPTION 'Entry not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(v_entry.tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF COALESCE(p_void, true) THEN
    IF v_entry.voided_at IS NOT NULL THEN RETURN; END IF;
    UPDATE public.finance_entries SET voided_at = now(), voided_by = auth.uid(), updated_at = now() WHERE id = p_id;
  ELSE
    IF v_entry.voided_at IS NULL THEN RETURN; END IF;
    UPDATE public.finance_entries SET voided_at = NULL, voided_by = NULL, updated_at = now() WHERE id = p_id;
  END IF;
  INSERT INTO public.audit_logs (tournament_id, user_id, action, entity_type, entity_id, reason, after_json)
  VALUES (v_entry.tournament_id, auth.uid(), CASE WHEN COALESCE(p_void, true) THEN 'FINANCE_ENTRY_VOIDED' ELSE 'FINANCE_ENTRY_RESTORED' END, 'FINANCE_ENTRY', p_id, left(p_reason, 200),
    jsonb_build_object('kind', v_entry.kind, 'category', v_entry.category, 'amount', v_entry.amount));
END;
$$;

CREATE FUNCTION public.get_finance_attachment(p_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v public.finance_entries;
BEGIN
  SELECT * INTO v FROM public.finance_entries WHERE id = p_id;
  IF v.id IS NULL OR auth.uid() IS NULL OR NOT public.is_tournament_organizer(v.tournament_id) THEN RAISE EXCEPTION 'Entry not found'; END IF;
  IF v.attachment IS NULL THEN RETURN NULL; END IF;
  RETURN 'data:' || v.attachment_type || ';base64,' || translate(encode(v.attachment, 'base64'), E'\n', '');
END;
$$;

--------------------------------------------------------------------------------
-- The log: manual entries plus the fees collected and refunded, newest first
--------------------------------------------------------------------------------
CREATE FUNCTION public.get_finance_ledger(p_tournament_id uuid)
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
    SELECT 'REFUND', p.id, 'EXPENSE', 'Refunds', p.refunded_amount, (p.updated_at AT TIME ZONE v_zone)::date,
           'Refund: ' || COALESCE((SELECT o.label FROM public.registration_owner(p.kind, p.registration_id) o LIMIT 1), 'registration'),
           NULL::text, false, false, NULL::text, NULL::text, p.updated_at
    FROM public.registration_payments p WHERE p.tournament_id = p_tournament_id AND p.refunded_amount > 0
  ) x
  ORDER BY x.occurred_on DESC, x.created_at DESC;
END;
$$;

CREATE FUNCTION public.get_finance_summary(p_tournament_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_income numeric;
  v_expense numeric;
  v_fees numeric;
  v_refunds numeric;
  v_pending numeric;
  v_cats jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT COALESCE(sum(l.amount) FILTER (WHERE l.kind = 'INCOME'), 0), COALESCE(sum(l.amount) FILTER (WHERE l.kind = 'EXPENSE'), 0),
         COALESCE(sum(l.amount) FILTER (WHERE l.source = 'FEE'), 0), COALESCE(sum(l.amount) FILTER (WHERE l.source = 'REFUND'), 0)
  INTO v_income, v_expense, v_fees, v_refunds
  FROM public.get_finance_ledger(p_tournament_id) l WHERE NOT l.voided;
  SELECT COALESCE(sum(amount), 0) INTO v_pending FROM public.registration_payments WHERE tournament_id = p_tournament_id AND status = 'SUBMITTED';
  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', c.kind, 'category', c.category, 'total', c.total) ORDER BY c.kind DESC, c.total DESC), '[]'::jsonb) INTO v_cats
  FROM (SELECT l.kind, l.category, sum(l.amount) AS total FROM public.get_finance_ledger(p_tournament_id) l WHERE NOT l.voided GROUP BY l.kind, l.category) c;
  RETURN jsonb_build_object('income', v_income, 'expense', v_expense, 'net', v_income - v_expense, 'fees_collected', v_fees, 'refunds', v_refunds,
    'awaiting_confirmation', v_pending, 'by_category', v_cats);
END;
$$;

REVOKE ALL ON FUNCTION public.save_finance_entry(uuid, uuid, text, text, numeric, date, text, text, text, boolean), public.void_finance_entry(uuid, boolean, text),
  public.get_finance_attachment(uuid), public.get_finance_ledger(uuid), public.get_finance_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_finance_entry(uuid, uuid, text, text, numeric, date, text, text, text, boolean), public.void_finance_entry(uuid, boolean, text),
  public.get_finance_attachment(uuid), public.get_finance_ledger(uuid), public.get_finance_summary(uuid) TO authenticated;
