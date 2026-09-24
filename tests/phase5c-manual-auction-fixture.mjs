import assert from 'node:assert/strict';
import pg from 'pg';

const connectionString = process.env.M25_DATABASE_URL;
if (!connectionString || !/127\.0\.0\.1|localhost/.test(connectionString)) {
  throw new Error('M25_DATABASE_URL must point to local Postgres');
}

const tournamentId = '90200000-0000-0000-0000-000000000001';
const organizerId = '90000000-0000-0000-0000-000000000001';
const owner2Id = '90000000-0000-0000-0000-000000000005';
const owner2Email = 'owner2@tourny.local';
const owner2Password = 'TournyTest123!';
const team2Id = '90300000-0000-0000-0000-000000000002';

const players = [
  { suffix: 1, name: 'Arjun Nair', primary: 'SETTER', secondary: 'OPPOSITE', category: 'A' },
  { suffix: 2, name: 'Rahul Menon', primary: 'OUTSIDE_HITTER', secondary: 'LIBERO', category: 'A' },
  { suffix: 3, name: 'Vivek Kumar', primary: 'MIDDLE_BLOCKER', secondary: 'OPPOSITE', category: 'A' },
  { suffix: 4, name: 'Aditya Rao', primary: 'OPPOSITE', secondary: 'OUTSIDE_HITTER', category: 'A' },
  { suffix: 5, name: 'Neeraj Singh', primary: 'OUTSIDE_HITTER', secondary: 'OPPOSITE', category: 'B' },
  { suffix: 6, name: 'Kiran Patel', primary: 'SETTER', secondary: 'LIBERO', category: 'B' },
  { suffix: 7, name: 'Farhan Ali', primary: 'MIDDLE_BLOCKER', secondary: 'OUTSIDE_HITTER', category: 'B' },
  { suffix: 8, name: 'Rohan Das', primary: 'LIBERO', secondary: 'SETTER', category: 'B' },
  { suffix: 9, name: 'Manu Joseph', primary: 'OUTSIDE_HITTER', secondary: 'OPPOSITE', category: 'C' },
  { suffix: 10, name: 'Deepak Shetty', primary: 'OPPOSITE', secondary: 'MIDDLE_BLOCKER', category: 'C' },
  { suffix: 11, name: 'Akhil Thomas', primary: 'MIDDLE_BLOCKER', secondary: 'OUTSIDE_HITTER', category: 'C' },
  { suffix: 12, name: 'Sanjay Krishnan', primary: 'LIBERO', secondary: 'SETTER', category: 'C' },
].map((player) => ({
  ...player,
  playerId: `91500000-0000-0000-0000-${String(player.suffix).padStart(12, '0')}`,
  registrationId: `91600000-0000-0000-0000-${String(player.suffix).padStart(12, '0')}`,
  registrationNumber: `QA-AUC-${String(player.suffix).padStart(3, '0')}`,
}));

const client = new pg.Client({ connectionString });
await client.connect();

try {
  await client.query('BEGIN');

  const tournament = (
    await client.query(
      `SELECT t.id,s.min_squad_size,s.max_squad_size
       FROM public.tournaments t
       JOIN public.tournament_settings s ON s.tournament_id=t.id
       WHERE t.id=$1 AND t.slug='tourny-local-qa-cup'
         AND t.format='LEAGUE' AND t.league_mode='AUCTION'`,
      [tournamentId],
    )
  ).rows[0];
  assert.ok(tournament, 'Local QA auction tournament is missing');

  const existingAuction = await client.query(
    'SELECT id,status FROM public.auctions WHERE tournament_id=$1',
    [tournamentId],
  );
  assert.equal(existingAuction.rowCount, 0, 'Manual QA fixture must be seeded before auction preparation');

  await client.query(
    `UPDATE auth.users SET
       confirmation_token=COALESCE(confirmation_token,''),
       recovery_token=COALESCE(recovery_token,''),
       email_change_token_new=COALESCE(email_change_token_new,''),
       email_change=COALESCE(email_change,''),
       phone_change_token=COALESCE(phone_change_token,''),
       email_change_token_current=COALESCE(email_change_token_current,''),
       reauthentication_token=COALESCE(reauthentication_token,'')
     WHERE email LIKE '%@tourny.local'`,
  );
  await client.query(
    `INSERT INTO auth.users(
       instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
       raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous,
       confirmation_token,recovery_token,email_change_token_new,email_change,
       phone_change_token,email_change_token_current,reauthentication_token
     ) VALUES(
       '00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,
       extensions.crypt($3,extensions.gen_salt('bf')),now(),
       '{"provider":"email","providers":["email"]}',
       '{"full_name":"QA Team Owner Two"}',now(),now(),false,false,
       '','','','','','',''
     )
     ON CONFLICT(id) DO UPDATE SET
       email=EXCLUDED.email,
       encrypted_password=EXCLUDED.encrypted_password,
       email_confirmed_at=EXCLUDED.email_confirmed_at,
       raw_app_meta_data=EXCLUDED.raw_app_meta_data,
       raw_user_meta_data=EXCLUDED.raw_user_meta_data,
       confirmation_token='',recovery_token='',email_change_token_new='',email_change='',
       phone_change_token='',email_change_token_current='',reauthentication_token='',
       updated_at=now()`,
    [owner2Id, owner2Email, owner2Password],
  );
  await client.query(
    `INSERT INTO auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
     VALUES($1::text,$1::uuid,jsonb_build_object('sub',$1::text,'email',$2::text),'email',now(),now())
     ON CONFLICT(provider_id,provider) DO UPDATE SET identity_data=EXCLUDED.identity_data,updated_at=now()`,
    [owner2Id, owner2Email],
  );
  await client.query(
    `INSERT INTO public.tournament_members(tournament_id,user_id,role,status)
     VALUES($1,$2,'TEAM_OWNER','ACTIVE')
     ON CONFLICT(tournament_id,user_id,role) DO UPDATE SET status='ACTIVE'`,
    [tournamentId, owner2Id],
  );
  await client.query(
    `INSERT INTO public.team_owners(team_id,user_id,is_primary,status)
     VALUES($1,$2,true,'ACTIVE')
     ON CONFLICT(team_id,user_id) DO UPDATE SET is_primary=true,status='ACTIVE'`,
    [team2Id, owner2Id],
  );

  await client.query('SET LOCAL ROLE authenticated');
  await client.query(`SELECT set_config('request.jwt.claim.sub',$1,true)`, [organizerId]);
  await client.query(
    `SELECT public.update_auction_price_categories(
       $1,'Category A',500,'Category B',300,'Category C',100
     )`,
    [tournamentId],
  );
  await client.query('RESET ROLE');

  for (const player of players) {
    await client.query(
      `INSERT INTO public.player_profiles(
         id,display_name,primary_position,secondary_position,place
       ) VALUES($1,$2,$3,$4,'Local QA')
       ON CONFLICT(id) DO UPDATE SET
         display_name=EXCLUDED.display_name,
         primary_position=EXCLUDED.primary_position,
         secondary_position=EXCLUDED.secondary_position,
         place=EXCLUDED.place`,
      [player.playerId, player.name, player.primary, player.secondary],
    );
    await client.query(
      `INSERT INTO public.player_tournament_registrations(
         id,tournament_id,player_id,status,registration_number
       ) VALUES($1,$2,$3,'PENDING',$4)
       ON CONFLICT(id) DO UPDATE SET
         tournament_id=EXCLUDED.tournament_id,
         player_id=EXCLUDED.player_id,
         registration_number=EXCLUDED.registration_number,
         status=CASE
           WHEN public.player_tournament_registrations.status='APPROVED' THEN 'APPROVED'
           ELSE 'PENDING'
         END`,
      [player.registrationId, tournamentId, player.playerId, player.registrationNumber],
    );
  }

  const categories = new Map(
    (
      await client.query(
        `SELECT category_code,id FROM public.tournament_auction_categories
         WHERE tournament_id=$1`,
        [tournamentId],
      )
    ).rows.map((row) => [row.category_code, row.id]),
  );
  assert.deepEqual([...categories.keys()].sort(), ['A', 'B', 'C']);

  await client.query('SET LOCAL ROLE authenticated');
  await client.query(`SELECT set_config('request.jwt.claim.sub',$1,true)`, [organizerId]);
  for (const player of players) {
    await client.query(
      `SELECT public.approve_player_registration($1,'MAIN_AUCTION','Local manual auction QA fixture',$2)`,
      [player.registrationId, categories.get(player.category)],
    );
  }

  const readiness = (
    await client.query('SELECT public.get_auction_readiness($1) value', [tournamentId])
  ).rows[0].value;
  assert.equal(readiness.blockers.includes('NO_ELIGIBLE_PLAYERS'), false);
  assert.equal(readiness.blockers.includes('MINIMUM_SQUADS_UNREACHABLE'), false);
  assert.equal(readiness.ready, true);
  await client.query('RESET ROLE');

  const verifiedPlayers = (
    await client.query(
      `SELECT p.primary_position,c.category_code,count(*)::integer count
       FROM public.player_tournament_registrations r
       JOIN public.player_profiles p ON p.id=r.player_id
       JOIN public.tournament_auction_categories c ON c.id=r.auction_price_category_id
       WHERE r.tournament_id=$1 AND r.id=ANY($2::uuid[])
         AND r.status='APPROVED' AND r.auction_category='MAIN_AUCTION'
         AND public.auction_player_is_eligible(r.tournament_id,r.player_id)
       GROUP BY p.primary_position,c.category_code
       ORDER BY c.category_code,p.primary_position`,
      [tournamentId, players.map((player) => player.registrationId)],
    )
  ).rows;
  assert.equal(verifiedPlayers.reduce((sum, row) => sum + row.count, 0), players.length);

  await client.query('COMMIT');

  const byCategory = Object.fromEntries(
    ['A', 'B', 'C'].map((category) => [
      category,
      players.filter((player) => player.category === category).length,
    ]),
  );
  const byPosition = Object.fromEntries(
    [...new Set(players.map((player) => player.primary))].sort().map((position) => [
      position,
      players.filter((player) => player.primary === position).length,
    ]),
  );

  console.log(JSON.stringify({
    status: 'PASS',
    players: players.length,
    byCategory,
    byPosition,
    minSquad: Number(tournament.min_squad_size),
    maxSquad: Number(tournament.max_squad_size),
    readiness,
    prepareEnabled: readiness.ready,
    owner2Email,
  }));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
