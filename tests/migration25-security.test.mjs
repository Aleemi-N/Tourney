import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../db/migrations/20260924000025_phase5c_live_auction.sql', import.meta.url), 'utf8');

assert.match(sql, /CREATE TABLE public\.auction_public_events/);
assert.match(sql, /CREATE TABLE public\.tournament_auction_categories/);
assert.match(sql, /category_code IN \('A','B','C'\)/);
assert.match(sql, /minimum_acquisition_reserve_price/);
assert.match(sql, /Category prices must satisfy A >= B >= C > 0/);
assert.match(sql, /min_squad_size/);
assert.match(sql, /max_allowed_bid/);
assert.match(sql, /p_request_key text/);
assert.doesNotMatch(sql, /p_request_key text DEFAULT NULL/);
assert.match(sql, /SET search_path = pg_catalog, public/g);
assert.match(sql, /REVOKE INSERT,UPDATE,DELETE ON public\.tournament_auction_categories,public\.auctions/);
assert.match(sql, /ALTER PUBLICATION supabase_realtime ADD TABLE public\.auction_public_events/);
for (const raw of ['auction_bids','auction_team_wallets','purse_transactions','auction_players','auction_sales']) {
  assert.match(sql, new RegExp(`ALTER PUBLICATION supabase_realtime DROP TABLE public\\.${raw}`));
}
assert.match(sql, /REVOKE ALL ON FUNCTION[\s\S]*public\.prepare_auction/);
assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_auction_public_state\(uuid\),public\.get_public_live_state\(uuid\) TO anon/);
console.log('Migration 25 static security: PASS');
