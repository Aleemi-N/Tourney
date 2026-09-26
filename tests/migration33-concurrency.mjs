import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';

const url=process.env.M33_DATABASE_URL??'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
if(!/127\.0\.0\.1|localhost/.test(url))throw new Error('M33_DATABASE_URL must be local');
const organizer='90000000-0000-0000-0000-000000000001',org='90100000-0000-0000-0000-000000000001';
async function authClient(){const c=new pg.Client({connectionString:url});await c.connect();await c.query('SET ROLE authenticated');await c.query(`SELECT set_config('request.jwt.claim.sub',$1,false)`,[organizer]);return c;}

test('concurrent stage removals serialize and audit once',async()=>{
 const admin=new pg.Client({connectionString:url});await admin.connect();
 const tournament='93600000-0000-0000-0000-000000000001',stage='93600000-0000-0000-0000-000000000002';let c1,c2;
 try{
  await admin.query(`DELETE FROM public.audit_logs WHERE tournament_id=$1`,[tournament]);await admin.query(`DELETE FROM public.tournaments WHERE id=$1`,[tournament]);
  await admin.query(`INSERT INTO public.tournaments(id,organization_id,name,slug,format,league_mode,status,is_public,created_by) VALUES($1,$2,'Remove Race','m33-remove-race','LEAGUE','REGISTERED_TEAM','DRAFT',false,$3)`,[tournament,org,organizer]);
  await admin.query(`INSERT INTO public.tournament_stages(id,tournament_id,name,stage_type,sequence,status) VALUES($1,$2,'Race Stage','LEAGUE',1,'PENDING')`,[stage,tournament]);
  [c1,c2]=await Promise.all([authClient(),authClient()]);
  const plan=(await c1.query(`SELECT public.preview_tournament_stage_removal($1) result`,[stage])).rows[0].result;
  const results=await Promise.allSettled([c1.query(`SELECT public.remove_tournament_stage($1,$2,$3)`,[stage,plan.snapshot,plan.confirmation_phrase]),c2.query(`SELECT public.remove_tournament_stage($1,$2,$3)`,[stage,plan.snapshot,plan.confirmation_phrase])]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.filter(result=>result.status==='rejected').length,1);
  assert.equal((await admin.query(`SELECT count(*)::int n FROM public.audit_logs WHERE tournament_id=$1 AND action='TOURNAMENT_STAGE_REMOVED'`,[tournament])).rows[0].n,1);
 }finally{if(c1)await c1.end();if(c2)await c2.end();await admin.query(`DELETE FROM public.audit_logs WHERE tournament_id=$1`,[tournament]);await admin.query(`DELETE FROM public.tournaments WHERE id=$1`,[tournament]);await admin.end();}
});

