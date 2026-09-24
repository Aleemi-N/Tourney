BEGIN;

INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('25000000-0000-0000-0000-000000000001','m25-organizer@example.test','{"full_name":"M25 Organizer"}'),
 ('25000000-0000-0000-0000-000000000002','m25-owner-a@example.test','{"full_name":"M25 Owner A"}'),
 ('25000000-0000-0000-0000-000000000003','m25-owner-b@example.test','{"full_name":"M25 Owner B"}');
INSERT INTO public.organizations(id,name,slug,created_by) VALUES
 ('25100000-0000-0000-0000-000000000001','M25 Org','m25-org','25000000-0000-0000-0000-000000000001');
INSERT INTO public.tournaments(id,organization_id,name,slug,format,league_mode,is_public,created_by) VALUES
 ('25200000-0000-0000-0000-000000000001','25100000-0000-0000-0000-000000000001','M25 Auction','m25-auction','LEAGUE','AUCTION',true,'25000000-0000-0000-0000-000000000001');
INSERT INTO public.tournament_members(tournament_id,user_id,role) VALUES
 ('25200000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000001','ORGANIZER'),
 ('25200000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000002','TEAM_OWNER'),
 ('25200000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000003','TEAM_OWNER');
INSERT INTO public.tournament_settings(tournament_id,min_squad_size,max_squad_size,auction_starting_purse,auction_base_price,auction_bid_increment,icon_selection_method,setter_selection_method,reauction_price_rule)
VALUES ('25200000-0000-0000-0000-000000000001',6,10,1000,100,100,'AUCTION','AUCTION','ORGANIZER_SETS_PRICE');
INSERT INTO public.teams(id,tournament_id,name,status) VALUES
 ('25300000-0000-0000-0000-000000000001','25200000-0000-0000-0000-000000000001','Alpha','ACTIVE'),
 ('25300000-0000-0000-0000-000000000002','25200000-0000-0000-0000-000000000001','Beta','ACTIVE');
INSERT INTO public.team_owners(team_id,user_id,is_primary,status) VALUES
 ('25300000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000002',true,'ACTIVE'),
 ('25300000-0000-0000-0000-000000000002','25000000-0000-0000-0000-000000000003',true,'ACTIVE');

INSERT INTO public.player_profiles(id,display_name,primary_position)
SELECT ('25400000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'Player '||g,'UNIVERSAL' FROM generate_series(1,16) g;
INSERT INTO public.player_tournament_registrations(tournament_id,player_id,status,auction_category,registration_number)
SELECT '25200000-0000-0000-0000-000000000001',id,'PENDING',NULL,display_name
FROM public.player_profiles WHERE id::text LIKE '25400000-0000-0000-0000-%';
INSERT INTO public.team_players(tournament_id,team_id,player_id,acquisition_type,status)
SELECT '25200000-0000-0000-0000-000000000001','25300000-0000-0000-0000-000000000001',id,'MANUAL','ACTIVE'
FROM public.player_profiles WHERE display_name IN('Player 1','Player 2');
INSERT INTO public.team_players(tournament_id,team_id,player_id,acquisition_type,status)
SELECT '25200000-0000-0000-0000-000000000001','25300000-0000-0000-0000-000000000002',id,'MANUAL','ACTIVE'
FROM public.player_profiles WHERE display_name IN('Player 3','Player 4');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','25000000-0000-0000-0000-000000000001',true);

DO $$
DECLARE prepared jsonb; started jsonb; opened jsonb; opened2 jsonb; v_auction_id uuid; auction_version bigint; player_id uuid; player_version bigint; bid jsonb; sold jsonb; unsold jsonb; repriced jsonb; requeued jsonb; reg record; cat uuid;
BEGIN
  PERFORM public.update_auction_price_categories('25200000-0000-0000-0000-000000000001','Premium',500,'Standard',300,'Emerging',100);
  FOR reg IN SELECT r.id,p.display_name FROM public.player_tournament_registrations r JOIN public.player_profiles p ON p.id=r.player_id WHERE r.tournament_id='25200000-0000-0000-0000-000000000001' LOOP
    SELECT id INTO cat FROM public.tournament_auction_categories WHERE tournament_id='25200000-0000-0000-0000-000000000001' AND category_code=CASE WHEN reg.display_name IN('Player 5','Player 15') THEN 'A' WHEN reg.display_name IN('Player 6','Player 16') THEN 'B' ELSE 'C' END;
    PERFORM public.approve_player_registration(reg.id,CASE WHEN reg.display_name='Player 15' THEN 'ICON_LOT' WHEN reg.display_name='Player 16' THEN 'SETTER_LOT' ELSE 'MAIN_AUCTION' END,NULL,cat);
  END LOOP;
  IF NOT (public.get_auction_readiness('25200000-0000-0000-0000-000000000001')->>'ready')::boolean THEN RAISE EXCEPTION 'readiness failed: %',public.get_auction_readiness('25200000-0000-0000-0000-000000000001'); END IF;
  prepared:=public.prepare_auction('25200000-0000-0000-0000-000000000001');
  v_auction_id:=(prepared->>'auction_id')::uuid;
  IF (public.prepare_auction('25200000-0000-0000-0000-000000000001')->>'idempotent')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'prepare retry'; END IF;
  IF (SELECT count(*) FROM public.auction_players WHERE auction_id=v_auction_id)<>12 THEN RAISE EXCEPTION 'eligible pool'; END IF;
  IF (prepared->>'minimum_acquisition_reserve_price')::numeric<>100 THEN RAISE EXCEPTION 'reserve floor snapshot'; END IF;
  IF (SELECT base_price FROM public.auction_players ap JOIN public.player_profiles p ON p.id=ap.player_id WHERE ap.auction_id=v_auction_id AND p.display_name='Player 5')<>500 THEN RAISE EXCEPTION 'category A initial price'; END IF;
  BEGIN PERFORM public.update_auction_price_categories('25200000-0000-0000-0000-000000000001','Premium',600,'Standard',300,'Emerging',100); RAISE EXCEPTION 'configuration lock failed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='configuration lock failed' THEN RAISE; END IF; END;
  SELECT state_version INTO auction_version FROM public.auctions WHERE id=v_auction_id;
  started:=public.set_auction_lifecycle(v_auction_id,'START',auction_version,'start-one');
  IF public.set_auction_lifecycle(v_auction_id,'START',auction_version,'start-one')<>started THEN RAISE EXCEPTION 'start idempotency'; END IF;
  opened:=public.open_next_auction_player(v_auction_id,(started->>'state_version')::bigint,'next-one');
  player_id:=(opened->>'auction_player_id')::uuid; player_version:=(opened->>'player_version')::bigint;
  bid:=public.place_auction_bid(v_auction_id,player_id,'25300000-0000-0000-0000-000000000001',700,'bid-700',player_version,0);
  IF (bid->>'max_allowed_bid')::numeric<>700 THEN RAISE EXCEPTION 'protected reserve expected 700: %',bid; END IF;
  IF (public.place_auction_bid(v_auction_id,player_id,'25300000-0000-0000-0000-000000000001',700,'bid-700',player_version,0)->>'idempotent')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'bid retry'; END IF;
  BEGIN PERFORM public.place_auction_bid(v_auction_id,player_id,'25300000-0000-0000-0000-000000000001',701,'bid-701',player_version,700); RAISE EXCEPTION 'reserve allowed 701'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='reserve allowed 701' THEN RAISE; END IF; END;
  sold:=public.finalize_auction_sale(v_auction_id,player_id,player_version,(bid->>'bid_id')::uuid,'sold-one');
  IF public.finalize_auction_sale(v_auction_id,player_id,player_version,(bid->>'bid_id')::uuid,'sold-one')<>sold THEN RAISE EXCEPTION 'sold retry'; END IF;
  SELECT state_version INTO auction_version FROM public.auctions WHERE id=v_auction_id;
  opened2:=public.open_next_auction_player(v_auction_id,auction_version,'next-two');
  unsold:=public.mark_auction_player_unsold(v_auction_id,(opened2->>'auction_player_id')::uuid,(opened2->>'player_version')::bigint,'unsold-two');
  repriced:=public.set_reauction_price(v_auction_id,(opened2->>'auction_player_id')::uuid,50,(unsold->>'player_version')::bigint,'price-two');
  requeued:=public.requeue_auction_player(v_auction_id,(opened2->>'auction_player_id')::uuid,(repriced->>'player_version')::bigint,'requeue-two');
  IF (requeued->>'base_price')::numeric<>50 OR (SELECT minimum_acquisition_reserve_price FROM public.auctions WHERE id=v_auction_id)<>100 THEN RAISE EXCEPTION 'reauction/reserve separation'; END IF;
  IF public.get_auction_public_state(v_auction_id)::text LIKE '%remaining_purse%' OR public.get_auction_public_state(v_auction_id)::text LIKE '%submitted_by%' THEN RAISE EXCEPTION 'public leak'; END IF;
END $$;

RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.auction_sales s JOIN public.auction_players ap ON ap.id=s.auction_player_id JOIN public.auctions a ON a.id=ap.auction_id WHERE a.tournament_id='25200000-0000-0000-0000-000000000001')<>1 OR (SELECT count(*) FROM public.purse_transactions pt JOIN public.auction_team_wallets w ON w.id=pt.wallet_id JOIN public.auctions a ON a.id=w.auction_id WHERE a.tournament_id='25200000-0000-0000-0000-000000000001' AND pt.transaction_type='PURCHASE')<>1 THEN RAISE EXCEPTION 'sale/ledger uniqueness'; END IF;
  IF (SELECT remaining_balance FROM public.auction_team_wallets w JOIN public.auctions a ON a.id=w.auction_id WHERE a.tournament_id='25200000-0000-0000-0000-000000000001' AND w.team_id='25300000-0000-0000-0000-000000000001')<>300 THEN RAISE EXCEPTION 'wallet debit'; END IF;
  IF has_table_privilege('authenticated','public.auctions','INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated','public.auction_bids','INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated','public.auction_team_wallets','INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated','public.purse_transactions','INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'direct authenticated DML exposed'; END IF;
  IF has_function_privilege('anon','public.place_auction_bid(uuid,uuid,uuid,numeric,text,bigint,numeric)','EXECUTE') OR has_function_privilege('anon','public.finalize_auction_sale(uuid,uuid,bigint,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'anon mutation execute'; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('prepare_auction','set_auction_lifecycle','open_next_auction_player','place_auction_bid','finalize_auction_sale','mark_auction_player_unsold','set_reauction_price','requeue_auction_player','complete_auction','get_auction_organizer_state','get_auction_owner_state','get_auction_public_state','get_public_live_state') AND (NOT p.prosecdef OR NOT p.proconfig @> ARRAY['search_path=pg_catalog, public'])) THEN RAISE EXCEPTION 'security definer/search path'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='auction_public_events') THEN RAISE EXCEPTION 'events not published'; END IF;
  IF EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename IN('auction_bids','auction_team_wallets','purse_transactions','auction_players','auction_sales')) THEN RAISE EXCEPTION 'raw auction publication'; END IF;
END $$;

ROLLBACK;
