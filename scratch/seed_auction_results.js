const { Client } = require('pg');
const crypto = require('crypto');
const client = new Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:54322/postgres' });

async function seedAuctionResults() {
  await client.connect();
  const tourneyId = '90200000-0000-0000-0000-000000000001';
  
  const auctionRes = await client.query("SELECT id FROM public.auctions WHERE tournament_id = $1;", [tourneyId]);
  const auctionId = auctionRes.rows[0].id;

  await client.query("BEGIN;");

  // Get teams
  const teamsRes = await client.query("SELECT id FROM public.teams WHERE tournament_id = $1 ORDER BY name;", [tourneyId]);
  const teams = teamsRes.rows;

  // Get players who are waiting
  const playersRes = await client.query("SELECT id, player_id FROM public.auction_players WHERE auction_id = $1 AND status = 'WAITING';", [auctionId]);
  const players = playersRes.rows;

  // Get a real user
  const userRes = await client.query("SELECT id FROM public.profiles LIMIT 1;");
  const fakeUserId = userRes.rows[0].id;

  console.log(`Seeding ${players.length} players into ${teams.length} teams using user ${fakeUserId}...`);

  // Round robin assignment
  let teamIdx = 0;
  for (const p of players) {
    const teamId = teams[teamIdx].id;

    // 1. Insert into team_players
    await client.query(`
      INSERT INTO public.team_players (team_id, player_id, tournament_id, acquisition_type)
      VALUES ($1, $2, $3, 'AUCTION')
      ON CONFLICT DO NOTHING;
    `, [teamId, p.player_id, tourneyId]);

    // Create a fake bid first
    const bidRes = await client.query(`
      INSERT INTO public.auction_bids (auction_id, auction_player_id, team_id, amount, source, idempotency_key, submitted_by)
      VALUES ($1, $2, $3, 500, 'ORGANIZER', $4, $5)
      RETURNING id;
    `, [auctionId, p.id, teamId, crypto.randomUUID(), fakeUserId]);
    const bidId = bidRes.rows[0].id;

    // 2. Insert into auction_sales
    await client.query(`
      INSERT INTO public.auction_sales (auction_player_id, team_id, sold_amount, sold_at, winning_bid_id, confirmed_by)
      VALUES ($1, $2, 500, NOW(), $3, $4)
      ON CONFLICT DO NOTHING;
    `, [p.id, teamId, bidId, fakeUserId]);

    // 3. Update auction_players status
    await client.query(`
      UPDATE public.auction_players SET status = 'SOLD' WHERE id = $1;
    `, [p.id]);

    teamIdx = (teamIdx + 1) % teams.length;
  }

  // Mark auction completed
  await client.query(`
    UPDATE public.auctions SET status = 'COMPLETED', completed_at = NOW(), state_version = state_version + 1 WHERE id = $1;
  `, [auctionId]);

  console.log("Successfully seeded auction results!");
  await client.query("COMMIT;");
  await client.end();
}

seedAuctionResults().catch(console.error);
