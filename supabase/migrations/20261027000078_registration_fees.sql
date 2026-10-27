-- v2: registration fees. An organizer can ask players and/or teams for a fee (optional, per tournament, in rupees).
-- Payment happens on Razorpay's hosted page using the ORGANIZER'S OWN Razorpay account (the money goes straight to
-- them; Tourny never holds it). The API creates the payment link and records the result here. Organizers who do not
-- use Razorpay can collect offline and mark registrations paid. A registration with a fee cannot be approved until it
-- is paid (or marked paid / waived by the organizer).

ALTER TABLE public.tournament_settings
  ADD COLUMN player_registration_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (player_registration_fee >= 0 AND player_registration_fee <= 1000000),
  ADD COLUMN team_registration_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (team_registration_fee >= 0 AND team_registration_fee <= 1000000);

-- The organizer's Razorpay keys. The secret is stored encrypted by the API; nothing but the API's own database role can read this table.
CREATE TABLE public.tournament_payment_accounts (
  tournament_id uuid PRIMARY KEY REFERENCES public.tournaments(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'RAZORPAY' CHECK (provider = 'RAZORPAY'),
  key_id text NOT NULL,
  key_secret_enc text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('test', 'live')),
  connected_by uuid REFERENCES public.profiles(id),
  connected_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.registration_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('PLAYER', 'TEAM')),
  registration_id uuid NOT NULL, -- player_tournament_registrations.id or team_owner_applications.id, by kind
  payer_user_id uuid REFERENCES public.profiles(id),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'PAID', 'WAIVED', 'EXPIRED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED')),
  provider text NOT NULL CHECK (provider IN ('RAZORPAY', 'MANUAL')),
  provider_link_id text,
  provider_payment_id text,
  short_url text,
  refunded_amount numeric(12,2) NOT NULL DEFAULT 0,
  note text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX registration_payments_reg_idx ON public.registration_payments (kind, registration_id, created_at DESC);
CREATE INDEX registration_payments_open_idx ON public.registration_payments (created_at) WHERE status = 'CREATED';
CREATE UNIQUE INDEX registration_payments_provider_payment_idx ON public.registration_payments (provider_payment_id) WHERE provider_payment_id IS NOT NULL;

ALTER TABLE public.tournament_payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tournament_payment_accounts, public.registration_payments FROM PUBLIC, anon, authenticated;

--------------------------------------------------------------------------------
-- Who a registration belongs to, and the tournament it is for
--------------------------------------------------------------------------------
CREATE FUNCTION public.registration_owner(p_kind text, p_registration_id uuid)
RETURNS TABLE (tournament_id uuid, user_id uuid, label text, status text)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT r.tournament_id, pp.user_id, pp.display_name, r.status
  FROM public.player_tournament_registrations r JOIN public.player_profiles pp ON pp.id = r.player_id
  WHERE p_kind = 'PLAYER' AND r.id = p_registration_id
  UNION ALL
  SELECT a.tournament_id, a.user_id, a.proposed_team_name, a.status FROM public.team_owner_applications a WHERE p_kind = 'TEAM' AND a.id = p_registration_id;
$$;
REVOKE ALL ON FUNCTION public.registration_owner(text, uuid) FROM PUBLIC, anon, authenticated;

-- The fee that applies to one registration (0 when free).
CREATE FUNCTION public.registration_fee(p_tournament_id uuid, p_kind text)
RETURNS numeric
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE((SELECT CASE WHEN p_kind = 'PLAYER' THEN player_registration_fee ELSE team_registration_fee END
                   FROM public.tournament_settings WHERE tournament_id = p_tournament_id), 0);
$$;
REVOKE ALL ON FUNCTION public.registration_fee(uuid, text) FROM PUBLIC, anon, authenticated;

-- Whether the fee of a registration is settled: free, paid, waived, or paid and then only partly refunded.
CREATE FUNCTION public.registration_settled(p_kind text, p_registration_id uuid, p_tournament_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.registration_fee(p_tournament_id, p_kind) = 0
    OR EXISTS (SELECT 1 FROM public.registration_payments WHERE kind = p_kind AND registration_id = p_registration_id AND status IN ('PAID', 'WAIVED', 'PARTIALLY_REFUNDED'));
$$;
REVOKE ALL ON FUNCTION public.registration_settled(text, uuid, uuid) FROM PUBLIC, anon, authenticated;

--------------------------------------------------------------------------------
-- The rule: no approval before the fee is settled (the database enforces it, whichever screen is used)
--------------------------------------------------------------------------------
CREATE FUNCTION public.require_registration_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_kind text := CASE TG_TABLE_NAME WHEN 'player_tournament_registrations' THEN 'PLAYER' ELSE 'TEAM' END;
BEGIN
  IF NEW.status = 'APPROVED' AND OLD.status IS DISTINCT FROM 'APPROVED' AND NOT public.registration_settled(v_kind, NEW.id, NEW.tournament_id) THEN
    RAISE EXCEPTION 'The registration fee has not been paid' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.require_registration_fee() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER require_registration_fee BEFORE UPDATE OF status ON public.player_tournament_registrations FOR EACH ROW EXECUTE FUNCTION public.require_registration_fee();
CREATE TRIGGER require_registration_fee BEFORE UPDATE OF status ON public.team_owner_applications FOR EACH ROW EXECUTE FUNCTION public.require_registration_fee();

--------------------------------------------------------------------------------
-- Functions for the apps
--------------------------------------------------------------------------------
CREATE FUNCTION public.set_registration_fees(p_tournament_id uuid, p_player_fee numeric, p_team_fee numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF COALESCE(p_player_fee, 0) < 0 OR COALESCE(p_team_fee, 0) < 0 OR COALESCE(p_player_fee, 0) > 1000000 OR COALESCE(p_team_fee, 0) > 1000000 THEN RAISE EXCEPTION 'A fee must be between 0 and 10,00,000 rupees'; END IF;
  UPDATE public.tournament_settings SET player_registration_fee = round(COALESCE(p_player_fee, 0), 2), team_registration_fee = round(COALESCE(p_team_fee, 0), 2) WHERE tournament_id = p_tournament_id;
END;
$$;

-- Fees and whether the organizer takes payment online (public for public tournaments).
CREATE FUNCTION public.get_registration_fees(p_tournament_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object('player_fee', s.player_registration_fee, 'team_fee', s.team_registration_fee, 'currency', 'INR',
    'online', EXISTS (SELECT 1 FROM public.tournament_payment_accounts a WHERE a.tournament_id = p_tournament_id))
  FROM public.tournament_settings s
  WHERE s.tournament_id = p_tournament_id
    AND (EXISTS (SELECT 1 FROM public.public_tournament_view v WHERE v.id = p_tournament_id) OR public.is_tournament_organizer(p_tournament_id));
$$;

-- Payments the signed-in user still has to make: their registrations with a fee that is not settled.
CREATE FUNCTION public.my_payments_due()
RETURNS TABLE (kind text, registration_id uuid, tournament_id uuid, tournament_name text, label text, amount numeric, online boolean, status text)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT x.kind, x.id, x.tournament_id, t.name, x.label,
    public.registration_fee(x.tournament_id, x.kind),
    EXISTS (SELECT 1 FROM public.tournament_payment_accounts a WHERE a.tournament_id = x.tournament_id),
    COALESCE((SELECT p.status FROM public.registration_payments p WHERE p.kind = x.kind AND p.registration_id = x.id ORDER BY p.created_at DESC LIMIT 1), 'DUE')
  FROM (
    SELECT 'PLAYER' AS kind, r.id, r.tournament_id, pp.display_name AS label, r.status
    FROM public.player_tournament_registrations r JOIN public.player_profiles pp ON pp.id = r.player_id WHERE pp.user_id = auth.uid()
    UNION ALL
    SELECT 'TEAM', a.id, a.tournament_id, a.proposed_team_name, a.status FROM public.team_owner_applications a WHERE a.user_id = auth.uid()
  ) x JOIN public.tournaments t ON t.id = x.tournament_id
  WHERE auth.uid() IS NOT NULL AND x.status IN ('PENDING', 'CHANGES_REQUESTED')
    AND public.registration_fee(x.tournament_id, x.kind) > 0
    AND NOT public.registration_settled(x.kind, x.id, x.tournament_id)
  ORDER BY t.name;
$$;

-- Payment status of every registration of a tournament, for the organizer's lists.
CREATE FUNCTION public.list_registration_payments(p_tournament_id uuid)
RETURNS TABLE (kind text, registration_id uuid, payment_id uuid, status text, amount numeric, provider text, refunded_amount numeric, paid_at timestamptz, note text, label text)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY
  SELECT DISTINCT ON (p.kind, p.registration_id) p.kind, p.registration_id, p.id, p.status, p.amount, p.provider, p.refunded_amount, p.paid_at, p.note,
    (SELECT o.label FROM public.registration_owner(p.kind, p.registration_id) o LIMIT 1)
  FROM public.registration_payments p WHERE p.tournament_id = p_tournament_id
  ORDER BY p.kind, p.registration_id, p.created_at DESC;
END;
$$;

-- The organizer collected the fee another way (cash, UPI), or waives it.
CREATE FUNCTION public.mark_registration_paid(p_kind text, p_registration_id uuid, p_status text, p_note text DEFAULT NULL)
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
  -- An online link that is still open would otherwise stay payable after the organizer settled it.
  UPDATE public.registration_payments SET status = 'CANCELLED', updated_at = now() WHERE kind = p_kind AND registration_id = p_registration_id AND status = 'CREATED';
  INSERT INTO public.registration_payments (tournament_id, kind, registration_id, payer_user_id, amount, status, provider, note, created_by, paid_at)
  VALUES (v_tournament, p_kind, p_registration_id, v_user, CASE WHEN p_status = 'PAID' THEN public.registration_fee(v_tournament, p_kind) ELSE 0 END, p_status, 'MANUAL', left(p_note, 200), auth.uid(), now());
END;
$$;

REVOKE ALL ON FUNCTION public.set_registration_fees(uuid, numeric, numeric), public.get_registration_fees(uuid), public.my_payments_due(),
  public.list_registration_payments(uuid), public.mark_registration_paid(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_registration_fees(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_registration_fees(uuid, numeric, numeric), public.my_payments_due(), public.list_registration_payments(uuid),
  public.mark_registration_paid(text, uuid, text, text) TO authenticated;
