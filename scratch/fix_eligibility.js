const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:54322/postgres' });

async function fixTeamPlayers() {
  await client.connect();
  const auctionRes = await client.query("SELECT id, tournament_id FROM public.auctions WHERE tournament_id = '90200000-0000-0000-0000-000000000001';");
  const auctionId = auctionRes.rows[0].id;
  const tourneyId = auctionRes.rows[0].tournament_id;

  await client.query("BEGIN;");
  
  // Remove players from teams if they were added via auction for this tournament
  const delRes = await client.query(`
    DELETE FROM public.team_players 
    WHERE tournament_id = $1 
      AND player_id IN (
        SELECT player_id FROM public.auction_players WHERE auction_id = $2
      );
  `, [tourneyId, auctionId]);

  console.log(`Deleted ${delRes.rowCount} players from team_players to restore eligibility!`);

  await client.query("COMMIT;");
  await client.end();
}

fixTeamPlayers().catch(console.error);
