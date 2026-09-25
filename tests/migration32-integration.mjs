import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';

const databaseUrl = process.env.M32_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
if (!/127\.0\.0\.1|localhost/.test(databaseUrl)) throw new Error('M32_DATABASE_URL must be local');

const ids = {
  organizer: '90000000-0000-0000-0000-000000000001',
  outsider: '90000000-0000-0000-0000-000000000004',
  org: '90100000-0000-0000-0000-000000000001',
  tournament: '93200000-0000-0000-0000-000000000001',
  stage: '93200000-0000-0000-0000-000000000002',
};

async function setup(client) {
  await client.query('BEGIN');
  await client.query(`INSERT INTO public.tournaments(id,organization_id,name,slug,format,league_mode,status,is_public,created_by)
    VALUES($1,$2,'M32 Test','m32-test','LEAGUE','REGISTERED_TEAM','LIVE',true,$3)`, [ids.tournament, ids.org, ids.organizer]);
  await client.query(`INSERT INTO public.tournament_stages(id,tournament_id,name,stage_type,sequence,status)
    VALUES($1,$2,'League','LEAGUE',1,'ACTIVE')`, [ids.stage, ids.tournament]);
  const teams = [1,2,3,4].map((n) => `93200000-0000-0000-0001-${String(n).padStart(12,'0')}`);
  for (const [index,id] of teams.entries()) await client.query(`INSERT INTO public.teams(id,tournament_id,name,status) VALUES($1,$2,$3,'ACTIVE')`, [id,ids.tournament,`M32 Team ${index+1}`]);
  const rule = '93200000-0000-0000-0002-000000000001';
  await client.query(`INSERT INTO public.volleyball_rules(id,tournament_id,stage_id,sets_to_win,win_by_two) VALUES($1,$2,$3,2,true)`, [rule,ids.tournament,ids.stage]);
  await client.query(`INSERT INTO public.volleyball_set_rules(volleyball_rule_id,set_number,target_points) VALUES($1,1,25),($1,2,25),($1,3,15)`, [rule]);
  return teams;
}

async function asUser(client,userId) {
  await client.query('SET LOCAL ROLE authenticated');
  await client.query(`SELECT set_config('request.jwt.claim.sub',$1,true)`,[userId]);
}

async function expectSqlReject(client, query, pattern) {
  await client.query('SAVEPOINT expected_error');
  await assert.rejects(client.query(query.text, query.values), pattern);
  await client.query('ROLLBACK TO SAVEPOINT expected_error');
}

async function completeRoundRobin(client, teams) {
  let number=0;
  for(let home=0;home<teams.length;home++) for(let away=home+1;away<teams.length;away++) {
    number++;
    const match=(await client.query(`INSERT INTO public.matches(tournament_id,stage_id,match_number,round_number,home_team_id,away_team_id,status) VALUES($1,$2,$3,1,$4,$5,'SCHEDULED') RETURNING id`,[ids.tournament,ids.stage,number,teams[home],teams[away]])).rows[0];
    await client.query(`UPDATE public.matches SET status='COMPLETED',winner_team_id=$2 WHERE id=$1`,[match.id,teams[home]]);
  }
}

test('M32 ordering is atomic, revisioned, scoped, preserving match state', async () => {
  const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
  try {
    const teams = await setup(client);
    const matches=[];
    for(let i=0;i<3;i++) {
      const result=await client.query(`INSERT INTO public.matches(tournament_id,stage_id,match_number,round_number,home_team_id,away_team_id,status,scheduled_at,court)
        VALUES($1,$2,$3,1,$4,$5,'SCHEDULED',now()+make_interval(hours=>$3),$6) RETURNING id,program_order`,[ids.tournament,ids.stage,i+1,teams[i],teams[i+1],`Court ${i+1}`]);
      matches.push(result.rows[0]);
    }
    await client.query(`INSERT INTO public.tournament_members(tournament_id,user_id,role,status) VALUES($1,$2,'SCORER','ACTIVE')`,[ids.tournament,ids.outsider]);
    await client.query(`INSERT INTO public.match_scorers(match_id,user_id,assigned_by) VALUES($1,$2,$3)`,[matches[0].id,ids.outsider,ids.organizer]);
    const setId=(await client.query(`INSERT INTO public.match_sets(match_id,set_number,target_points,home_score,away_score,status) VALUES($1,1,25,1,0,'LIVE') RETURNING id`,[matches[0].id])).rows[0].id;
    await client.query(`INSERT INTO public.score_events(match_id,match_set_id,sequence_number,event_type,team_id,home_score_after,away_score_after,idempotency_key,created_by) VALUES($1,$2,1,'POINT',$3,1,0,'preserve',$4)`,[matches[0].id,setId,teams[0],ids.outsider]);
    const before=await client.query(`SELECT id,scheduled_at,court,home_team_id,away_team_id FROM public.matches WHERE stage_id=$1 ORDER BY program_order`,[ids.stage]);
    const revision=(await client.query(`SELECT revision FROM public.match_order_scopes WHERE stage_id=$1 AND round_number=1`,[ids.stage])).rows[0].revision;
    const ordered=[matches[2].id,matches[1].id,matches[0].id];
    await asUser(client,ids.outsider);
    await expectSqlReject(client,{text:`SELECT public.reorder_matches($1,$2,1,$3::uuid[],$4)`,values:[ids.tournament,ids.stage,ordered,revision]},/Unauthorized/);
    await asUser(client,ids.organizer);
    await expectSqlReject(client,{text:`SELECT public.reorder_matches($1,$2,1,$3::uuid[],$4)`,values:[ids.tournament,ids.stage,ordered.slice(0,2),revision]},/complete duplicate-free/);
    await expectSqlReject(client,{text:`SELECT public.reorder_matches($1,$2,1,$3::uuid[],$4)`,values:[ids.tournament,ids.stage,[ordered[0],ordered[0],ordered[2]],revision]},/complete duplicate-free/);
    const applied=await client.query(`SELECT public.reorder_matches($1,$2,1,$3::uuid[],$4) result`,[ids.tournament,ids.stage,ordered,revision]);
    assert.equal(applied.rows[0].result.revision,Number(revision)+1);
    const after=await client.query(`SELECT id,scheduled_at,court,home_team_id,away_team_id,program_order FROM public.matches WHERE stage_id=$1 ORDER BY program_order`,[ids.stage]);
    assert.deepEqual(after.rows.map((r)=>r.id),ordered);
    for(const row of before.rows) assert.deepEqual(after.rows.find((item)=>item.id===row.id),{...row,program_order:after.rows.find((item)=>item.id===row.id).program_order});
    assert.equal((await client.query(`SELECT count(*)::int count FROM public.match_scorers WHERE match_id=$1`,[matches[0].id])).rows[0].count,1);
    assert.equal((await client.query(`SELECT count(*)::int count FROM public.match_sets WHERE match_id=$1`,[matches[0].id])).rows[0].count,1);
    assert.equal((await client.query(`SELECT count(*)::int count FROM public.score_events WHERE match_id=$1`,[matches[0].id])).rows[0].count,1);
    await expectSqlReject(client,{text:`SELECT public.reorder_matches($1,$2,1,$3::uuid[],$4)`,values:[ids.tournament,ids.stage,ordered,revision]},/Stale/);
    await client.query('SET LOCAL ROLE postgres'); await client.query(`UPDATE public.matches SET status='LIVE' WHERE id=$1`,[ordered[0]]); await asUser(client,ids.organizer);
    await expectSqlReject(client,{text:`SELECT public.reorder_matches($1,$2,1,$3::uuid[],$4)`,values:[ids.tournament,ids.stage,[ordered[1],ordered[0],ordered[2]],Number(revision)+1]},/LIVE and COMPLETED/);
    assert.equal((await client.query(`SELECT count(*)::int count FROM public.audit_logs WHERE tournament_id=$1 AND action='MATCH_ORDER_REORDERED'`,[ids.tournament])).rows[0].count,1);
  } finally { await client.query('ROLLBACK'); await client.end(); }
});

test('M32 top-four plan is idempotent and routes winners and losers', async () => {
  const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
  try {
    const teams=await setup(client); await completeRoundRobin(client,teams);
    assert.equal((await client.query(`SELECT status FROM public.tournaments WHERE id=$1`,[ids.tournament])).rows[0].status,'LIVE');
    await asUser(client,ids.organizer);
    const preview=(await client.query(`SELECT public.preview_league_progression($1,'TOP_4_SEMIFINALS',true) result`,[ids.stage])).rows[0].result;
    assert.equal(preview.matches.length,4); assert.equal(preview.standings.length,4);
    const first=(await client.query(`SELECT public.apply_league_progression($1,'TOP_4_SEMIFINALS',true,'m32-top4') result`,[ids.stage])).rows[0].result;
    const retry=(await client.query(`SELECT public.apply_league_progression($1,'TOP_4_SEMIFINALS',true,'m32-top4') result`,[ids.stage])).rows[0].result;
    assert.equal(retry.idempotent,true); assert.equal(retry.plan_id,first.plan_id);
    await expectSqlReject(client,{text:`SELECT public.apply_league_progression($1,'FINISH_AFTER_LEAGUE',false,'conflict')`,values:[ids.stage]},/conflicting/);
    assert.equal((await client.query(`SELECT qualification_count FROM public.tournament_stages WHERE id=$1`,[ids.stage])).rows[0].qualification_count,4);
    const semis=(await client.query(`SELECT id,home_team_id,away_team_id FROM public.matches WHERE stage_id=$1 AND bracket_match_type='SEMIFINAL' ORDER BY bracket_position`,[first.target_stage_id])).rows;
    await client.query('SET LOCAL ROLE postgres');
    await client.query(`UPDATE public.matches SET status='COMPLETED',winner_team_id=home_team_id WHERE id=$1`,[semis[0].id]);
    await client.query(`UPDATE public.matches SET status='COMPLETED',winner_team_id=away_team_id WHERE id=$1`,[semis[1].id]);
    const final=(await client.query(`SELECT home_team_id,away_team_id FROM public.matches WHERE stage_id=$1 AND bracket_match_type='FINAL'`,[first.target_stage_id])).rows[0];
    const third=(await client.query(`SELECT home_team_id,away_team_id FROM public.matches WHERE stage_id=$1 AND bracket_match_type='THIRD_PLACE'`,[first.target_stage_id])).rows[0];
    assert.deepEqual(final,{home_team_id:semis[0].home_team_id,away_team_id:semis[1].away_team_id});
    assert.deepEqual(third,{home_team_id:semis[0].away_team_id,away_team_id:semis[1].home_team_id});
    assert.equal((await client.query(`SELECT count(*)::int count FROM public.match_sets ms JOIN public.matches m ON m.id=ms.match_id WHERE m.stage_id=$1`,[first.target_stage_id])).rows[0].count,12);
    assert.equal((await client.query(`SELECT count(*)::int count FROM public.audit_logs WHERE action='LEAGUE_PROGRESSION_CONFIRMED' AND tournament_id=$1`,[ids.tournament])).rows[0].count,1);
  } finally { await client.query('ROLLBACK'); await client.end(); }
});

test('M32 supports top-two final with third place', async () => {
  const client=new pg.Client({connectionString:databaseUrl});await client.connect();
  try{
    const teams=await setup(client);await completeRoundRobin(client,teams);await asUser(client,ids.organizer);
    const result=(await client.query(`SELECT public.apply_league_progression($1,'TOP_2_FINAL',true,'top2-third') result`,[ids.stage])).rows[0].result;
    const matches=(await client.query(`SELECT bracket_match_type,home_team_id,away_team_id FROM public.matches WHERE stage_id=$1 ORDER BY bracket_position`,[result.target_stage_id])).rows;
    assert.deepEqual(matches.map((m)=>m.bracket_match_type),['FINAL','THIRD_PLACE']);
    assert.deepEqual(matches.map((m)=>[m.home_team_id,m.away_team_id]),[[teams[0],teams[1]],[teams[2],teams[3]]]);
    assert.equal((await client.query(`SELECT count(*)::int count FROM public.match_sets ms JOIN public.matches m ON m.id=ms.match_id WHERE m.stage_id=$1`,[result.target_stage_id])).rows[0].count,6);
  }finally{await client.query('ROLLBACK');await client.end();}
});

test('M32 rejects incomplete leagues and explicitly finishes completed leagues', async () => {
  const client=new pg.Client({connectionString:databaseUrl});await client.connect();
  try{
    const teams=await setup(client);await asUser(client,ids.organizer);
    await expectSqlReject(client,{text:`SELECT public.preview_league_progression($1,'FINISH_AFTER_LEAGUE',false)`,values:[ids.stage]},/no matches/);
    await client.query('SET LOCAL ROLE postgres');
    const incomplete=(await client.query(`INSERT INTO public.matches(tournament_id,stage_id,match_number,round_number,home_team_id,away_team_id,status) VALUES($1,$2,1,1,$3,$4,'SCHEDULED') RETURNING id`,[ids.tournament,ids.stage,teams[0],teams[1]])).rows[0].id;
    await asUser(client,ids.organizer);
    await expectSqlReject(client,{text:`SELECT public.preview_league_progression($1,'FINISH_AFTER_LEAGUE',false)`,values:[ids.stage]},/not complete/);
    await client.query('SET LOCAL ROLE postgres');await client.query(`DELETE FROM public.matches WHERE id=$1`,[incomplete]);await completeRoundRobin(client,teams);await asUser(client,ids.organizer);
    const result=(await client.query(`SELECT public.apply_league_progression($1,'FINISH_AFTER_LEAGUE',false,'finish') result`,[ids.stage])).rows[0].result;
    assert.equal(result.target_stage_id,null);assert.equal((await client.query(`SELECT status FROM public.tournaments WHERE id=$1`,[ids.tournament])).rows[0].status,'COMPLETED');
  }finally{await client.query('ROLLBACK');await client.end();}
});

test('M32 security boundary keeps new operational data private', async () => {
  const client=new pg.Client({connectionString:databaseUrl});await client.connect();
  try {
    await client.query('BEGIN'); await client.query('SET LOCAL ROLE anon');
    assert.equal((await client.query('SELECT count(*)::int count FROM public.tournament_progression_plans')).rows[0].count,0);
    assert.equal((await client.query('SELECT count(*)::int count FROM public.progression_plan_seeds')).rows[0].count,0);
    assert.equal((await client.query('SELECT count(*)::int count FROM public.match_order_scopes')).rows[0].count,0);
    assert.equal((await client.query(`SELECT has_function_privilege('anon','public.reorder_matches(uuid,uuid,integer,uuid[],bigint)','EXECUTE') allowed`)).rows[0].allowed,false);
    const columns=(await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='public_fixture_view'`)).rows.map((r)=>r.column_name);
    for(const required of ['round_number','bracket_position','program_order','bracket_match_type']) assert(columns.includes(required));
    for(const forbidden of ['loser_next_match_id','loser_next_match_slot','scorer_user_id']) assert(!columns.includes(forbidden));
  } finally { await client.query('ROLLBACK'); await client.end(); }
});
