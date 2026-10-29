import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';

const url=process.env.M33_DATABASE_URL??'postgresql://postgres:postgres@127.0.0.1:5440/tourny';
if(!/127\.0\.0\.1|localhost/.test(url))throw new Error('M33_DATABASE_URL must be local');
const organizer='90000000-0000-0000-0000-000000000001', outsider='90000000-0000-0000-0000-000000000004', org='90100000-0000-0000-0000-000000000001';
const tournament='93500000-0000-0000-0000-000000000001', stage='93500000-0000-0000-0000-000000000002';
async function asUser(c,id){await c.query('SET LOCAL ROLE authenticated');await c.query(`SELECT set_config('request.jwt.claim.sub',$1,true)`,[id]);}
async function rejectAtSavepoint(c,text,values,pattern){await c.query('SAVEPOINT expected');await assert.rejects(c.query(text,values),pattern);await c.query('ROLLBACK TO SAVEPOINT expected');}

test('M33 authorization, rollback, dependency, stale-preview, and cascade integration',async()=>{
 const c=new pg.Client({connectionString:url});await c.connect();
 try{
  await c.query('BEGIN');
  await c.query(`INSERT INTO public.tournaments(id,organization_id,name,slug,format,league_mode,status,is_public,created_by) VALUES($1,$2,'Remove Test','m33-remove-test','LEAGUE','REGISTERED_TEAM','DRAFT',false,$3)`,[tournament,org,organizer]);
  await c.query(`INSERT INTO public.tournament_stages(id,tournament_id,name,stage_type,sequence,status) VALUES($1,$2,'Pool A','LEAGUE',1,'PENDING')`,[stage,tournament]);
  const teams=['93500000-0000-0000-0001-000000000001','93500000-0000-0000-0001-000000000002'];
  await c.query(`INSERT INTO public.teams(id,tournament_id,name,status) VALUES($1,$3,'Keep One','ACTIVE'),($2,$3,'Keep Two','ACTIVE')`,[...teams,tournament]);
  const rule='93500000-0000-0000-0002-000000000001';
  await c.query(`INSERT INTO public.volleyball_rules(id,tournament_id,stage_id,sets_to_win) VALUES($1,$2,$3,2)`,[rule,tournament,stage]);
  await c.query(`INSERT INTO public.volleyball_set_rules(volleyball_rule_id,set_number,target_points) VALUES($1,1,25)`,[rule]);
  await asUser(c,outsider); await rejectAtSavepoint(c,`SELECT public.preview_tournament_stage_removal($1)`,[stage],/Unauthorized/);
  await asUser(c,organizer);
  let plan=(await c.query(`SELECT public.preview_tournament_stage_removal($1) result`,[stage])).rows[0].result;
  assert.equal(plan.allowed,true); assert.equal(plan.remove.fixtures,0);
  await rejectAtSavepoint(c,`SELECT public.remove_tournament_stage($1,$2,'wrong')`,[stage,plan.snapshot],/Confirmation phrase/);
  assert.equal((await c.query(`SELECT count(*)::int n FROM public.tournament_stages WHERE id=$1`,[stage])).rows[0].n,1);
  await c.query('SET LOCAL ROLE postgres');
  await c.query(`INSERT INTO public.tournament_progression_plans(tournament_id,source_stage_id,decision,idempotency_key,standings_revision,created_by) VALUES($1,$2,'FINISH_AFTER_LEAGUE','m33-dependency','[]'::jsonb,$3)`,[tournament,stage,organizer]);
  await asUser(c,organizer); const dependencyPlan=(await c.query(`SELECT public.preview_tournament_stage_removal($1) result`,[stage])).rows[0].result;
  assert.equal(dependencyPlan.allowed,false); assert(dependencyPlan.blockers.some((item)=>item.code==='PROGRESSION_DEPENDENCY'));
  await c.query('SET LOCAL ROLE postgres'); await c.query(`DELETE FROM public.tournament_progression_plans WHERE source_stage_id=$1`,[stage]);
  await c.query('SET LOCAL ROLE postgres');
  const match=(await c.query(`INSERT INTO public.matches(tournament_id,stage_id,match_number,round_number,home_team_id,away_team_id,status) VALUES($1,$2,1,1,$3,$4,'SCHEDULED') RETURNING id`,[tournament,stage,...teams])).rows[0].id;
  await asUser(c,organizer); await rejectAtSavepoint(c,`SELECT public.remove_tournament_stage($1,$2,$3)`,[stage,plan.snapshot,plan.confirmation_phrase],/changed after/);
  plan=(await c.query(`SELECT public.preview_tournament_stage_removal($1) result`,[stage])).rows[0].result;
  assert.equal(plan.requires_strong_confirmation,true);
  await c.query('SET LOCAL ROLE postgres'); await c.query(`UPDATE public.matches SET status='LIVE' WHERE id=$1`,[match]); await asUser(c,organizer);
  const blocked=(await c.query(`SELECT public.preview_tournament_stage_removal($1) result`,[stage])).rows[0].result;
  assert.equal(blocked.allowed,false); assert(blocked.blockers.some((item)=>item.code==='LIVE_MATCHES'));
  await rejectAtSavepoint(c,`SELECT public.remove_tournament_stage($1,$2,$3)`,[stage,blocked.snapshot,blocked.confirmation_phrase],/cannot be removed/);
  await c.query('SET LOCAL ROLE postgres'); await c.query(`UPDATE public.matches SET status='SCHEDULED' WHERE id=$1`,[match]); await asUser(c,organizer);
  plan=(await c.query(`SELECT public.preview_tournament_stage_removal($1) result`,[stage])).rows[0].result;
  await c.query('SET LOCAL ROLE postgres');
  await c.query(`CREATE FUNCTION pg_temp.fail_stage_delete() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'forced rollback'; END$$`);
  await c.query(`CREATE TRIGGER m33_force_rollback BEFORE DELETE ON public.tournament_stages FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_stage_delete()`);
  await asUser(c,organizer); await rejectAtSavepoint(c,`SELECT public.remove_tournament_stage($1,$2,$3)`,[stage,plan.snapshot,plan.confirmation_phrase],/forced rollback/);
  assert.equal((await c.query(`SELECT count(*)::int n FROM public.matches WHERE id=$1`,[match])).rows[0].n,1);
  assert.equal((await c.query(`SELECT count(*)::int n FROM public.audit_logs WHERE tournament_id=$1 AND action='TOURNAMENT_STAGE_REMOVED'`,[tournament])).rows[0].n,0);
  await c.query('SET LOCAL ROLE postgres'); await c.query(`DROP TRIGGER m33_force_rollback ON public.tournament_stages`); await asUser(c,organizer);
  await c.query(`SELECT public.remove_tournament_stage($1,$2,$3)`,[stage,plan.snapshot,plan.confirmation_phrase]);
  assert.equal((await c.query(`SELECT count(*)::int n FROM public.matches WHERE id=$1`,[match])).rows[0].n,0);
  assert.equal((await c.query(`SELECT count(*)::int n FROM public.teams WHERE tournament_id=$1`,[tournament])).rows[0].n,2);
  assert.equal((await c.query(`SELECT count(*)::int n FROM public.audit_logs WHERE tournament_id=$1 AND action='TOURNAMENT_STAGE_REMOVED'`,[tournament])).rows[0].n,1);
 }finally{await c.query('ROLLBACK');await c.end();}
});
