BEGIN;

INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ('27000000-0000-0000-0000-000000000001','category-org@example.test','{"full_name":"Category Organizer"}');
INSERT INTO public.organizations(id,name,slug,created_by) VALUES ('27100000-0000-0000-0000-000000000001','Category Org','category-org','27000000-0000-0000-0000-000000000001');
INSERT INTO public.tournaments(id,organization_id,name,slug,format,league_mode,created_by) VALUES
 ('27200000-0000-0000-0000-000000000001','27100000-0000-0000-0000-000000000001','Category Auction','category-auction','LEAGUE','AUCTION','27000000-0000-0000-0000-000000000001'),
 ('27200000-0000-0000-0000-000000000002','27100000-0000-0000-0000-000000000001','Other Auction','other-auction','LEAGUE','AUCTION','27000000-0000-0000-0000-000000000001');
INSERT INTO public.tournament_members(tournament_id,user_id,role) VALUES
 ('27200000-0000-0000-0000-000000000001','27000000-0000-0000-0000-000000000001','ORGANIZER'),
 ('27200000-0000-0000-0000-000000000002','27000000-0000-0000-0000-000000000001','ORGANIZER');
INSERT INTO public.tournament_settings(tournament_id,min_squad_size,max_squad_size,auction_starting_purse,auction_base_price,auction_bid_increment,icon_selection_method,setter_selection_method) VALUES
 ('27200000-0000-0000-0000-000000000001',1,5,5000,100,100,'LOT_DRAW','LOT_DRAW'),
 ('27200000-0000-0000-0000-000000000002',1,5,5000,100,100,'AUCTION','AUCTION');

-- Re-exercise the exact legacy compatibility strategy against a tournament
-- created with the Phase 5A single base-price configuration.
INSERT INTO public.tournament_auction_categories(tournament_id,category_code,display_name,base_price,display_order)
SELECT s.tournament_id,x.code,'Category '||x.code,s.auction_base_price,x.ord
FROM public.tournament_settings s CROSS JOIN (VALUES('A',1),('B',2),('C',3)) x(code,ord)
WHERE s.tournament_id='27200000-0000-0000-0000-000000000001';

INSERT INTO public.player_profiles(id,display_name,primary_position) VALUES
 ('27400000-0000-0000-0000-000000000001','Main Missing','UNIVERSAL'),
 ('27400000-0000-0000-0000-000000000002','Icon Lot','UNIVERSAL'),
 ('27400000-0000-0000-0000-000000000003','Setter Lot','UNIVERSAL'),
 ('27400000-0000-0000-0000-000000000004','Cross Tournament','UNIVERSAL');
INSERT INTO public.player_tournament_registrations(id,tournament_id,player_id,status) VALUES
 ('27500000-0000-0000-0000-000000000001','27200000-0000-0000-0000-000000000001','27400000-0000-0000-0000-000000000001','PENDING'),
 ('27500000-0000-0000-0000-000000000002','27200000-0000-0000-0000-000000000001','27400000-0000-0000-0000-000000000002','PENDING'),
 ('27500000-0000-0000-0000-000000000003','27200000-0000-0000-0000-000000000001','27400000-0000-0000-0000-000000000003','PENDING'),
 ('27500000-0000-0000-0000-000000000004','27200000-0000-0000-0000-000000000001','27400000-0000-0000-0000-000000000004','PENDING');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','27000000-0000-0000-0000-000000000001',true);

DO $$
DECLARE cat_a uuid; other_cat uuid;
BEGIN
  IF (SELECT count(*) FROM public.tournament_auction_categories WHERE tournament_id='27200000-0000-0000-0000-000000000001')<>3 OR EXISTS(SELECT 1 FROM public.tournament_auction_categories WHERE tournament_id='27200000-0000-0000-0000-000000000001' AND base_price<>100) THEN RAISE EXCEPTION 'legacy A/B/C backfill'; END IF;
  PERFORM public.update_auction_price_categories('27200000-0000-0000-0000-000000000001','Premium',500,'Standard',300,'Emerging',100);
  IF (SELECT array_agg(base_price ORDER BY display_order) FROM public.tournament_auction_categories WHERE tournament_id='27200000-0000-0000-0000-000000000001')<>ARRAY[500,300,100]::numeric[] THEN RAISE EXCEPTION 'category prices'; END IF;
  SELECT id INTO cat_a FROM public.tournament_auction_categories WHERE tournament_id='27200000-0000-0000-0000-000000000001' AND category_code='A';
  BEGIN PERFORM public.approve_player_registration('27500000-0000-0000-0000-000000000001','MAIN_AUCTION',NULL,NULL); RAISE EXCEPTION 'main missing accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='main missing accepted' THEN RAISE; END IF; END;
  PERFORM public.approve_player_registration('27500000-0000-0000-0000-000000000001','MAIN_AUCTION',NULL,cat_a);
  PERFORM public.approve_player_registration('27500000-0000-0000-0000-000000000002','ICON_LOT',NULL,NULL);
  PERFORM public.approve_player_registration('27500000-0000-0000-0000-000000000003','SETTER_LOT',NULL,NULL);
  PERFORM public.update_auction_price_categories('27200000-0000-0000-0000-000000000002','A',500,'B',300,'C',100);
  SELECT id INTO other_cat FROM public.tournament_auction_categories WHERE tournament_id='27200000-0000-0000-0000-000000000002' AND category_code='A';
  BEGIN PERFORM public.approve_player_registration('27500000-0000-0000-0000-000000000004','MAIN_AUCTION',NULL,other_cat); RAISE EXCEPTION 'cross tournament accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='cross tournament accepted' THEN RAISE; END IF; END;
  BEGIN PERFORM public.update_auction_price_categories('27200000-0000-0000-0000-000000000001','A',100,'B',300,'C',50); RAISE EXCEPTION 'bad order accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='bad order accepted' THEN RAISE; END IF; END;
  BEGIN PERFORM public.update_auction_price_categories('27200000-0000-0000-0000-000000000001','A',500,'B',300,'C',0); RAISE EXCEPTION 'zero accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='zero accepted' THEN RAISE; END IF; END;
END $$;

ROLLBACK;
