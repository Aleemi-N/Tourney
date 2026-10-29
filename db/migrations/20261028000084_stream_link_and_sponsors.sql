-- v2: a live stream link for the tournament ("Watch live" on the public pages, web and mobile) and sponsors (logos on the
-- public pages and on the streaming overlay). The sponsors table has existed since the first schema without any screens.

ALTER TABLE public.tournament_settings
  ADD COLUMN stream_url text CHECK (stream_url IS NULL OR (stream_url ~ '^https://[^[:space:]]+$' AND char_length(stream_url) <= 300));

ALTER TABLE public.sponsors
  ADD COLUMN tier text NOT NULL DEFAULT 'SPONSOR' CHECK (tier IN ('TITLE', 'SPONSOR', 'PARTNER')),
  ADD CONSTRAINT sponsors_name_length CHECK (char_length(name) BETWEEN 1 AND 80),
  ADD CONSTRAINT sponsors_website_web CHECK (website IS NULL OR (website ~ '^https?://[^[:space:]]+$' AND char_length(website) <= 300));
REVOKE ALL ON public.sponsors FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.set_stream_url(p_tournament_id uuid, p_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_url text := NULLIF(btrim(COALESCE(p_url, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v_url IS NOT NULL AND (v_url !~ '^https://[^[:space:]]+$' OR char_length(v_url) > 300) THEN RAISE EXCEPTION 'Paste the full link, starting with https://'; END IF;
  UPDATE public.tournament_settings SET stream_url = v_url WHERE tournament_id = p_tournament_id;
END;
$$;

-- What the public pages show besides the scores: the stream link and the sponsors (public tournaments only).
CREATE FUNCTION public.get_public_extras(p_slug text)
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'stream_url', s.stream_url,
    'sponsors', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', sp.id, 'name', sp.name, 'logo_path', sp.logo_path, 'website', sp.website, 'tier', sp.tier)
                                           ORDER BY CASE sp.tier WHEN 'TITLE' THEN 0 WHEN 'SPONSOR' THEN 1 ELSE 2 END, sp.display_order, sp.created_at)
                          FROM public.sponsors sp WHERE sp.tournament_id = v.id), '[]'::jsonb))
  FROM public.public_tournament_view v JOIN public.tournament_settings s ON s.tournament_id = v.id
  WHERE v.slug = p_slug;
$$;

CREATE FUNCTION public.list_sponsors(p_tournament_id uuid)
RETURNS TABLE (id uuid, name text, logo_path text, website text, tier text, display_order integer)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY SELECT sp.id, sp.name, sp.logo_path, sp.website, sp.tier, sp.display_order FROM public.sponsors sp WHERE sp.tournament_id = p_tournament_id
    ORDER BY CASE sp.tier WHEN 'TITLE' THEN 0 WHEN 'SPONSOR' THEN 1 ELSE 2 END, sp.display_order, sp.created_at;
END;
$$;

CREATE FUNCTION public.save_sponsor(p_tournament_id uuid, p_id uuid, p_name text, p_website text, p_tier text, p_logo_path text, p_order integer DEFAULT 0)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid := p_id;
  v_name text := btrim(COALESCE(p_name, ''));
  v_site text := NULLIF(btrim(COALESCE(p_website, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v_name = '' OR char_length(v_name) > 80 THEN RAISE EXCEPTION 'Enter the sponsor''s name (up to 80 characters)'; END IF;
  IF v_site IS NOT NULL AND (v_site !~ '^https?://[^[:space:]]+$' OR char_length(v_site) > 300) THEN RAISE EXCEPTION 'The website must start with https://'; END IF;
  IF p_tier NOT IN ('TITLE', 'SPONSOR', 'PARTNER') THEN RAISE EXCEPTION 'Choose title sponsor, sponsor or partner'; END IF;
  -- A logo is a file in this tournament's folder, so a sponsor cannot point at somebody else's upload.
  IF p_logo_path IS NOT NULL AND p_logo_path NOT LIKE p_tournament_id::text || '/%' THEN RAISE EXCEPTION 'Upload the logo from this tournament'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.sponsors (tournament_id, name, website, tier, logo_path, display_order) VALUES (p_tournament_id, v_name, v_site, p_tier, p_logo_path, COALESCE(p_order, 0)) RETURNING id INTO v_id;
  ELSE
    UPDATE public.sponsors SET name = v_name, website = v_site, tier = p_tier, logo_path = COALESCE(p_logo_path, logo_path), display_order = COALESCE(p_order, display_order)
    WHERE id = v_id AND tournament_id = p_tournament_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sponsor not found'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.delete_sponsor(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tournament uuid;
BEGIN
  SELECT tournament_id INTO v_tournament FROM public.sponsors WHERE id = p_id;
  IF v_tournament IS NULL THEN RAISE EXCEPTION 'Sponsor not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(v_tournament) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  DELETE FROM public.sponsors WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_stream_url(uuid, text), public.list_sponsors(uuid), public.save_sponsor(uuid, uuid, text, text, text, text, integer), public.delete_sponsor(uuid), public.get_public_extras(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_extras(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_stream_url(uuid, text), public.list_sponsors(uuid), public.save_sponsor(uuid, uuid, text, text, text, text, integer), public.delete_sponsor(uuid) TO authenticated;
