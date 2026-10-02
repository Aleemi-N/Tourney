const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:54322/postgres' });

async function putPlayerOnStage() {
  await client.connect();
  const auctionRes = await client.query("SELECT id FROM public.auctions WHERE tournament_id = '90200000-0000-0000-0000-000000000001';");
  const auctionId = auctionRes.rows[0].id;

  // Set auction to LIVE
  await client.query("UPDATE public.auctions SET status = 'LIVE' WHERE id = $1;", [auctionId]);

  // Set first player to SPOTLIGHT
  const playerRes = await client.query("SELECT id FROM public.auction_players WHERE auction_id = $1 ORDER BY auction_order ASC LIMIT 1;", [auctionId]);
  const auctionPlayerId = playerRes.rows[0].id;

  // Reset any other spotlight players to SOLD/UNSOLD or set target to SPOTLIGHT
  await client.query("UPDATE public.auction_players SET status = 'SPOTLIGHT' WHERE id = $1;", [auctionPlayerId]);

  console.log(`Updated auction ${auctionId} status to LIVE and player ${auctionPlayerId} to SPOTLIGHT.`);

  // Test RPC
  const stateRes = await client.query("SELECT public.get_auction_organizer_state($1);", [auctionId]);
  console.log('Organizer State Snapshot:', JSON.stringify(stateRes.rows[0].get_auction_organizer_state, null, 2));

  await client.end();
}

putPlayerOnStage().catch(console.error);
