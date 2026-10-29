import pg from 'pg';
import assert from 'assert';

const { Client } = pg;
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5440/tourny';

async function runTests() {
    console.log('--- STARTING MANUAL ASSIGNMENT INTEGRATION TESTS ---');
    const client = new Client({ connectionString });
    await client.connect();

    try {
        await client.query('BEGIN;');

        // 1. Setup Mock Identifiers (Valid UUID hex strings)
        const orgId = '77777777-7777-7777-7777-777777777777';
        const organizerUserId = '11111111-1111-1111-1111-111111111111';
        const ownerUserId = '22222222-2222-2222-2222-222222222222';
        
        const tourneyAId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
        const tourneyBId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

        const teamA1Id = 'a1111111-1111-1111-1111-111111111111'; // ₹0 purse team
        const teamA2Id = 'a2222222-2222-2222-2222-222222222222'; // normal purse team
        const teamB1Id = 'b1111111-1111-1111-1111-111111111111'; // cross tournament team

        const player1Id = '11111111-1111-1111-1111-111111111101'; // eligible player 1
        const player2Id = '11111111-1111-1111-1111-111111111102'; // eligible player 2
        const player3Id = '11111111-1111-1111-1111-111111111103'; // player on another team
        const player4Id = '11111111-1111-1111-1111-111111111104'; // cross tournament player
        const playerLiveId = '11111111-1111-1111-1111-111111111105'; // live auction player

        // 2. Insert Auth Users & Profiles
        await client.query(`
            INSERT INTO auth.users (id) VALUES ('${organizerUserId}'), ('${ownerUserId}') ON CONFLICT DO NOTHING;
            INSERT INTO public.profiles (id, full_name) VALUES 
                ('${organizerUserId}', 'Test Organizer'),
                ('${ownerUserId}', 'Test Owner')
            ON CONFLICT DO NOTHING;
        `);

        // Insert Player Profiles
        const players = [
            [player1Id, 'Player One'],
            [player2Id, 'Player Two'],
            [player3Id, 'Player Three'],
            [player4Id, 'Player Four'],
            [playerLiveId, 'Live Auction Player']
        ];
        for (const [id, name] of players) {
            await client.query(`
                INSERT INTO public.player_profiles (id, display_name, primary_position)
                VALUES ('${id}', '${name}', 'SETTER') ON CONFLICT DO NOTHING;
            `);
        }

        // Insert Organization & Tournaments
        await client.query(`
            INSERT INTO public.organizations (id, name, slug, created_by)
            VALUES ('${orgId}', 'Test Org', 'test-org-manual', '${organizerUserId}') ON CONFLICT DO NOTHING;

            INSERT INTO public.tournaments (id, organization_id, name, slug, format, league_mode, is_public, created_by)
            VALUES 
                ('${tourneyAId}', '${orgId}', 'Tournament A', 'tourney-a', 'LEAGUE', 'AUCTION', true, '${organizerUserId}'),
                ('${tourneyBId}', '${orgId}', 'Tournament B', 'tourney-b', 'LEAGUE', 'AUCTION', true, '${organizerUserId}')
            ON CONFLICT DO NOTHING;

            INSERT INTO public.tournament_members (tournament_id, user_id, role)
            VALUES 
                ('${tourneyAId}', '${organizerUserId}', 'ORGANIZER'),
                ('${tourneyBId}', '${organizerUserId}', 'ORGANIZER')
            ON CONFLICT DO NOTHING;
        `);

        // Insert Settings (max squad = 2)
        await client.query(`
            INSERT INTO public.tournament_settings (tournament_id, min_squad_size, max_squad_size)
            VALUES 
                ('${tourneyAId}', 1, 2),
                ('${tourneyBId}', 1, 2)
            ON CONFLICT DO NOTHING;
        `);

        // Insert Teams
        await client.query(`
            INSERT INTO public.teams (id, tournament_id, name) VALUES 
                ('${teamA1Id}', '${tourneyAId}', 'Team Zero Purse'),
                ('${teamA2Id}', '${tourneyAId}', 'Team Normal Purse'),
                ('${teamB1Id}', '${tourneyBId}', 'Team Tourney B')
            ON CONFLICT DO NOTHING;

            INSERT INTO public.team_owners (team_id, user_id, is_primary) VALUES
                ('${teamA1Id}', '${ownerUserId}', true)
            ON CONFLICT DO NOTHING;

            INSERT INTO public.tournament_members (tournament_id, user_id, role, team_id) VALUES
                ('${tourneyAId}', '${ownerUserId}', 'TEAM_OWNER', '${teamA1Id}')
            ON CONFLICT DO NOTHING;
        `);

        // Insert Registrations (Approved)
        await client.query(`
            INSERT INTO public.player_tournament_registrations (tournament_id, player_id, status) VALUES 
                ('${tourneyAId}', '${player1Id}', 'APPROVED'),
                ('${tourneyAId}', '${player2Id}', 'APPROVED'),
                ('${tourneyAId}', '${player3Id}', 'APPROVED'),
                ('${tourneyBId}', '${player4Id}', 'APPROVED'),
                ('${tourneyAId}', '${playerLiveId}', 'APPROVED')
            ON CONFLICT DO NOTHING;
        `);

        // Setup Auction & Wallet for Team A1 (Purse = ₹0) & Team A2 (Purse = ₹10,000)
        const auctionId = 'aaaaaaaa-1111-1111-1111-111111111111';
        await client.query(`
            INSERT INTO public.auctions (id, tournament_id, status, starting_purse, minimum_bid_increment) VALUES ('${auctionId}', '${tourneyAId}', 'LIVE', 10000, 500) ON CONFLICT DO NOTHING;

            INSERT INTO public.auction_team_wallets (auction_id, team_id, starting_balance, spent_amount, remaining_balance) VALUES
                ('${auctionId}', '${teamA1Id}', 10000, 10000, 0),
                ('${auctionId}', '${teamA2Id}', 10000, 2000, 8000)
            ON CONFLICT DO NOTHING;

            INSERT INTO public.auction_players (auction_id, player_id, base_price, original_base_price, status, auction_order) VALUES
                ('${auctionId}', '${playerLiveId}', 1000, 1000, 'LIVE', 1)
            ON CONFLICT DO NOTHING;
        `);

        // Helper to set auth role in pg transaction
        const setAuth = async (userId) => {
            await client.query(`SELECT set_config('role', 'authenticated', true);`);
            await client.query(`SELECT set_config('request.jwt.claims', '{"sub": "${userId}"}', true);`);
        };

        const expectError = async (fn, errorRegex, msg) => {
            await client.query('SAVEPOINT sp_test;');
            try {
                await fn();
                await client.query('RELEASE SAVEPOINT sp_test;');
                assert.fail(`${msg}: Expected error was not thrown`);
            } catch (err) {
                await client.query('ROLLBACK TO SAVEPOINT sp_test;');
                assert.match(err.message, errorRegex, `${msg}: Unexpected error message: ${err.message}`);
            }
        };

        // ----------------------------------------------------
        // TEST 1 — ZERO PURSE MANUAL ASSIGNMENT
        // ----------------------------------------------------
        await setAuth(organizerUserId);
        const res1 = await client.query(`SELECT public.assign_player_manually('${tourneyAId}'::uuid, '${teamA1Id}'::uuid, '${player1Id}'::uuid) AS result;`);
        const val1 = res1.rows[0].result;
        assert.strictEqual(val1.success, true, 'Test 1: assign_player_manually should succeed for ₹0 purse team');

        const walletCheck1 = await client.query(`SELECT remaining_balance FROM public.auction_team_wallets WHERE team_id = '${teamA1Id}';`);
        assert.strictEqual(Number(walletCheck1.rows[0].remaining_balance), 0, 'Test 1: Purse remaining balance must stay ₹0');

        const squadCheck1 = await client.query(`SELECT acquisition_type, acquisition_amount FROM public.team_players WHERE team_id = '${teamA1Id}' AND player_id = '${player1Id}';`);
        assert.strictEqual(squadCheck1.rows[0].acquisition_type, 'MANUAL_ASSIGNMENT', 'Test 1: acquisition_type must be MANUAL_ASSIGNMENT');
        assert.strictEqual(squadCheck1.rows[0].acquisition_amount, null, 'Test 1: acquisition_amount must be null / zero');

        console.log('TEST 1 — ZERO PURSE: PASS');

        // ----------------------------------------------------
        // TEST 2 — NORMAL PURSE MANUAL ASSIGNMENT
        // ----------------------------------------------------
        const res2 = await client.query(`SELECT public.assign_player_manually('${tourneyAId}'::uuid, '${teamA2Id}'::uuid, '${player2Id}'::uuid) AS result;`);
        assert.strictEqual(res2.rows[0].result.success, true, 'Test 2: assign_player_manually should succeed for normal purse team');

        const walletCheck2 = await client.query(`SELECT remaining_balance FROM public.auction_team_wallets WHERE team_id = '${teamA2Id}';`);
        assert.strictEqual(Number(walletCheck2.rows[0].remaining_balance), 8000, 'Test 2: Normal purse balance must remain unchanged at 8000');
        console.log('TEST 2 — NORMAL PURSE: PASS');

        // ----------------------------------------------------
        // TEST 3 — FULL SQUAD BLOCKED
        // max squad size = 2 for tourneyA. teamA1 already has player1 (1/2). Let's assign player3 to teamA1 (2/2).
        // ----------------------------------------------------
        await client.query(`SELECT public.assign_player_manually('${tourneyAId}'::uuid, '${teamA1Id}'::uuid, '${player3Id}'::uuid);`);
        // Now teamA1 has 2/2 players. Try assigning player2 to teamA1 -> should fail!
        await expectError(
            () => client.query(`SELECT public.assign_player_manually('${tourneyAId}'::uuid, '${teamA1Id}'::uuid, '${player2Id}'::uuid);`),
            /Maximum squad size/i,
            'Test 3: Full squad'
        );
        console.log('TEST 3 — FULL SQUAD: PASS');

        // ----------------------------------------------------
        // TEST 4 — DUPLICATE ASSIGNMENT BLOCKED
        // player1 is already on teamA1.
        // ----------------------------------------------------
        await expectError(
            () => client.query(`SELECT public.assign_player_manually('${tourneyAId}'::uuid, '${teamA2Id}'::uuid, '${player1Id}'::uuid);`),
            /already assigned/i,
            'Test 4: Duplicate player'
        );
        console.log('TEST 4 — DUPLICATE: PASS');

        // ----------------------------------------------------
        // TEST 5 — PLAYER ON ANOTHER TEAM BLOCKED
        // player3 is assigned to teamA1. Try assigning player3 to teamA2.
        // ----------------------------------------------------
        await expectError(
            () => client.query(`SELECT public.assign_player_manually('${tourneyAId}'::uuid, '${teamA2Id}'::uuid, '${player3Id}'::uuid);`),
            /already assigned/i,
            'Test 5: Player on another team'
        );
        console.log('TEST 5 — PLAYER ON ANOTHER TEAM: PASS');

        // ----------------------------------------------------
        // TEST 6 — UNAUTHORIZED OWNER BLOCKED
        // ----------------------------------------------------
        await setAuth(ownerUserId);
        await expectError(
            () => client.query(`SELECT public.assign_player_manually('${tourneyAId}'::uuid, '${teamA2Id}'::uuid, '${player2Id}'::uuid);`),
            /Unauthorized/i,
            'Test 6: Team owner authorization'
        );
        console.log('TEST 6 — UNAUTHORIZED OWNER: PASS');

        // ----------------------------------------------------
        // TEST 7 — CROSS TOURNAMENT BLOCKED
        // ----------------------------------------------------
        await setAuth(organizerUserId);
        await expectError(
            () => client.query(`SELECT public.assign_player_manually('${tourneyAId}'::uuid, '${teamA1Id}'::uuid, '${player4Id}'::uuid);`),
            /not registered in this tournament/i,
            'Test 7: Cross tournament'
        );
        console.log('TEST 7 — CROSS TOURNAMENT: PASS');

        // ----------------------------------------------------
        // TEST 8 — LIVE AUCTION PRESERVATION
        // playerLiveId is currently LIVE in auction. Try assigning playerLiveId -> should fail!
        // ----------------------------------------------------
        await expectError(
            () => client.query(`SELECT public.assign_player_manually('${tourneyAId}'::uuid, '${teamA2Id}'::uuid, '${playerLiveId}'::uuid);`),
            /LIVE in an active auction/i,
            'Test 8: Live auction player'
        );

        // Verify LIVE auction player state was NOT modified
        const liveCheck = await client.query(`SELECT status FROM public.auction_players WHERE player_id = '${playerLiveId}';`);
        assert.strictEqual(liveCheck.rows[0].status, 'LIVE', 'Test 8: LIVE player status must remain LIVE');
        console.log('TEST 8 — LIVE AUCTION PRESERVATION: PASS');

        // ----------------------------------------------------
        // TEST 9 — AUDIT LOG VERIFICATION
        // ----------------------------------------------------
        const auditCheck = await client.query(`SELECT action, entity_type FROM public.audit_logs WHERE action = 'PLAYER_MANUALLY_ASSIGNED' AND tournament_id = '${tourneyAId}';`);
        assert.ok(auditCheck.rows.length >= 2, 'Test 9: Audit log entries should exist for manual assignments');
        console.log('TEST 9 — AUDIT: PASS');

        await client.query('ROLLBACK;');
        console.log('--- ALL MANUAL ASSIGNMENT INTEGRATION TESTS PASSED ---');
    } catch (err) {
        await client.query('ROLLBACK;');
        console.error('TEST FAILURE:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

runTests();
