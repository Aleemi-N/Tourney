import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';

const url=process.env.M31_DATABASE_URL??'postgresql://postgres:postgres@127.0.0.1:5440/tourny';
if(!/127\.0\.0\.1|localhost/.test(url))throw new Error('M31_DATABASE_URL must be local');

test('M31 obsolete lot view is absent and anonymous score history is hidden',async()=>{
 const c=new pg.Client({connectionString:url});await c.connect();
 try{
  assert.equal((await c.query(`SELECT to_regclass('public.public_revealed_lot_state') value`)).rows[0].value,null);
  await c.query('BEGIN');await c.query('SET LOCAL ROLE anon');
  assert.equal((await c.query(`SELECT count(*)::int count FROM public.score_events`)).rows[0].count,0);
  await c.query('ROLLBACK');
 }finally{await c.end();}
});

