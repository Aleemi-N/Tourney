-- v2: change feed for the API's realtime websocket (replaces Supabase Realtime's WAL reader).
-- Every row change on the tables the apps subscribe to is announced on one NOTIFY channel.
-- Only the *_public_events tables (public by design) send their whole row; the others send
-- just the key columns, so a subscriber learns "something changed" and re-reads through
-- the normal, row-level-secured endpoints.

CREATE FUNCTION public.api_notify_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_record jsonb;
  v_payload text;
BEGIN
  IF TG_TABLE_NAME LIKE '%\_public\_events' THEN
    v_record := v_row;
  ELSE
    SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_record
    FROM jsonb_each(v_row) WHERE key IN ('id', 'match_id', 'tournament_id', 'auction_id', 'lot_session_id', 'status');
  END IF;
  v_payload := jsonb_build_object('schema', TG_TABLE_SCHEMA, 'table', TG_TABLE_NAME, 'type', TG_OP,
    CASE WHEN TG_OP = 'DELETE' THEN 'old_record' ELSE 'record' END, v_record)::text;
  -- NOTIFY payloads are limited to 8000 bytes; fall back to the keys if a row is larger.
  IF length(v_payload) > 7500 THEN
    v_payload := jsonb_build_object('schema', TG_TABLE_SCHEMA, 'table', TG_TABLE_NAME, 'type', TG_OP,
      CASE WHEN TG_OP = 'DELETE' THEN 'old_record' ELSE 'record' END,
      (SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) FROM jsonb_each(v_row) WHERE key IN ('id', 'match_id', 'tournament_id', 'auction_id', 'lot_session_id', 'sequence_number', 'event_type')))::text;
  END IF;
  PERFORM pg_notify('tourny_changes', v_payload);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.api_notify_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER api_change_feed AFTER INSERT OR UPDATE OR DELETE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.api_notify_change();
CREATE TRIGGER api_change_feed AFTER INSERT OR UPDATE OR DELETE ON public.match_sets FOR EACH ROW EXECUTE FUNCTION public.api_notify_change();
CREATE TRIGGER api_change_feed AFTER INSERT OR UPDATE OR DELETE ON public.score_events FOR EACH ROW EXECUTE FUNCTION public.api_notify_change();
CREATE TRIGGER api_change_feed AFTER INSERT OR UPDATE OR DELETE ON public.match_timeouts FOR EACH ROW EXECUTE FUNCTION public.api_notify_change();
CREATE TRIGGER api_change_feed AFTER INSERT OR UPDATE OR DELETE ON public.auction_public_events FOR EACH ROW EXECUTE FUNCTION public.api_notify_change();
CREATE TRIGGER api_change_feed AFTER INSERT OR UPDATE OR DELETE ON public.lot_public_events FOR EACH ROW EXECUTE FUNCTION public.api_notify_change();
