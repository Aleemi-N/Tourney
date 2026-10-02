const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:54322/postgres' });

async function resetAuction() {
  await client.connect();
  const auctionRes = await client.query("SELECT id FROM public.auctions WHERE tournament_id = '90200000-0000-0000-0000-000000000001';");
  const auctionId = auctionRes.rows[0].id;

  await client.query("BEGIN;");
  
  // 1. Delete purse transactions related to this auction's sales
  await client.query(`
    DELETE FROM public.purse_transactions 
    WHERE auction_sale_id IN (
      SELECT id FROM public.auction_sales 
      WHERE auction_player_id IN (
        SELECT id FROM public.auction_players WHERE auction_id = $1
      )
    );
  `, [auctionId]);

  // 2. Delete sales
  await client.query("DELETE FROM public.auction_sales WHERE auction_player_id IN (SELECT id FROM public.auction_players WHERE auction_id = $1);", [auctionId]);
  
  // 3. Delete bids
  await client.query("DELETE FROM public.auction_bids WHERE auction_id = $1;", [auctionId]);

  // 4. Reset players
  await client.query("UPDATE public.auction_players SET status = 'WAITING', attempt_number = 1, live_started_at = NULL, terminal_at = NULL WHERE auction_id = $1;", [auctionId]);

  // 5. Reset auction state
  await client.query("UPDATE public.auctions SET status = 'LIVE', completed_at = NULL, paused_at = NULL WHERE id = $1;", [auctionId]);
  
  await client.query("COMMIT;");
  console.log(`Successfully reset auction ${auctionId} back to LIVE state! You can now spotlight a player from the UI.`);

  await client.end();
}

resetAuction().catch(console.error);
