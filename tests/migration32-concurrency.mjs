import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';

const url=process.env.M32_DATABASE_URL??'postgresql://postgres:postgres@127.0.0.1:5440/tourny';
if(!/127\.0\.0\.1|localhost/.test(url))throw new Error('Concurrency tests require local Postgres');
const organizer='90000000-0000-0000-0000-000000000001',org='90100000-0000-0000-0000-000000000001';

async function authClient(){const c=new pg.Client({connectionString:url});await c.connect();await c.query('SET ROLE authenticated');await c.query(`SELECT set_config('request.jwt.claim.sub',$1,false)`,[organizer]);return c;}
async function cleanup(admin,tournaments){
  await admin.query(`DELETE FROM public.tournament_progression_plans WHERE tournament_id=ANY($1::uuid[])`,[tournaments]);
  await admin.query('DELETE FROM public.audit_logs WHERE tournament_id=ANY($1::uuid[])',[tournaments]);
  await admin.query('DELETE FROM public.tournaments WHERE id=ANY($1::uuid[])',[tournaments]);
}

test('concurrent reorder and progression requests serialize without duplicates',async()=>{
  const admin=new pg.Client({connectionString:url});await admin.connect();
  const orderTournament='93300000-0000-0000-0000-000000000001',orderStage='93300000-0000-0000-0000-000000000002';
  const progressionTournament='93400000-0000-0000-0000-000000000001',progressionStage='93400000-0000-0000-0000-000000000002';
  const clients=[];
  try{
    await admin.query(`SET statement_timeout='5s'`);
    await cleanup(admin,[orderTournament,progressionTournament]);
    await admin.query(`INSERT INTO public.tournaments(id,organization_id,name,slug,format,league_mode,status,is_public,created_by) VALUES
      ($1,$3,'Order Race','m32-order-race','LEAGUE','REGISTERED_TEAM','LIVE',false,$4),
      ($2,$3,'Progress Race','m32-progress-race','LEAGUE','REGISTERED_TEAM','LIVE',false,$4)`,[orderTournament,progressionTournament,org,organizer]);
    await admin.query(`INSERT INTO public.tournament_stages(id,tournament_id,name,stage_type,sequence,status) VALUES
      ($1,$2,'Order Stage','LEAGUE',1,'ACTIVE'),($3,$4,'Progress Stage','LEAGUE',1,'ACTIVE')`,[orderStage,orderTournament,progressionStage,progressionTournament]);
    const orderTeams=[],progressTeams=[];
    for(let i=1;i<=4;i++){
      const a=`93300000-0000-0000-0001-${String(i).padStart(12,'0')}`,b=`93400000-0000-0000-0001-${String(i).padStart(12,'0')}`;orderTeams.push(a);progressTeams.push(b);
      await admin.query(`INSERT INTO public.teams(id,tournament_id,name,status) VALUES($1,$2,$3,'ACTIVE'),($4,$5,$6,'ACTIVE')`,[a,orderTournament,`Order ${i}`,b,progressionTournament,`Progress ${i}`]);
    }
    for(const [rule,tournament,stage] of [['93300000-0000-0000-0002-000000000001',orderTournament,orderStage],['93400000-0000-0000-0002-000000000001',progressionTournament,progressionStage]]){
      await admin.query(`INSERT INTO public.volleyball_rules(id,tournament_id,stage_id,sets_to_win,win_by_two) VALUES($1,$2,$3,2,true)`,[rule,tournament,stage]);
      await admin.query(`INSERT INTO public.volleyball_set_rules(volleyball_rule_id,set_number,target_points) VALUES($1,1,25),($1,2,25),($1,3,15)`,[rule]);
    }
    const orderMatches=[];for(let i=0;i<3;i++)orderMatches.push((await admin.query(`INSERT INTO public.matches(tournament_id,stage_id,match_number,round_number,home_team_id,away_team_id) VALUES($1,$2,$3,1,$4,$5) RETURNING id`,[orderTournament,orderStage,i+1,orderTeams[i],orderTeams[i+1]])).rows[0].id);
    let n=0;for(let h=0;h<4;h++)for(let a=h+1;a<4;a++){n++;const id=(await admin.query(`INSERT INTO public.matches(tournament_id,stage_id,match_number,round_number,home_team_id,away_team_id) VALUES($1,$2,$3,1,$4,$5) RETURNING id`,[progressionTournament,progressionStage,n,progressTeams[h],progressTeams[a]])).rows[0].id;await admin.query(`UPDATE public.matches SET status='COMPLETED',winner_team_id=$2 WHERE id=$1`,[id,progressTeams[h]]);}
    const revision=(await admin.query(`SELECT revision FROM public.match_order_scopes WHERE stage_id=$1 AND round_number=1`,[orderStage])).rows[0].revision;
    const [c1,c2,c3,c4]=await Promise.all([authClient(),authClient(),authClient(),authClient()]);clients.push(c1,c2,c3,c4);
    const reorderResults=await Promise.allSettled([
      c1.query(`SELECT public.reorder_matches($1,$2,1,$3::uuid[],$4)`,[orderTournament,orderStage,[orderMatches[2],orderMatches[1],orderMatches[0]],revision]),
      c2.query(`SELECT public.reorder_matches($1,$2,1,$3::uuid[],$4)`,[orderTournament,orderStage,[orderMatches[1],orderMatches[2],orderMatches[0]],revision]),
    ]);
    assert.equal(reorderResults.filter((r)=>r.status==='fulfilled').length,1);assert.equal(reorderResults.filter((r)=>r.status==='rejected').length,1);
    const progressionResults=await Promise.all([
      c3.query(`SELECT public.apply_league_progression($1,'TOP_4_SEMIFINALS',true,'same-intent') result`,[progressionStage]),
      c4.query(`SELECT public.apply_league_progression($1,'TOP_4_SEMIFINALS',true,'same-intent') result`,[progressionStage]),
    ]);
    assert.equal(progressionResults.filter((r)=>r.rows[0].result.idempotent).length,1);
    assert.equal((await admin.query(`SELECT count(*)::int count FROM public.tournament_progression_plans WHERE source_stage_id=$1`,[progressionStage])).rows[0].count,1);
    assert.equal((await admin.query(`SELECT count(*)::int count FROM public.matches m JOIN public.tournament_stages s ON s.id=m.stage_id WHERE s.tournament_id=$1 AND s.stage_type='KNOCKOUT'`,[progressionTournament])).rows[0].count,4);
  }finally{
    for(const c of clients)await c.end();
    await cleanup(admin,[orderTournament,progressionTournament]);await admin.end();
  }
});
