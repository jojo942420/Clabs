import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readRecords,persistDelta} from '../worker/record-state.js';
import {recordDelta} from '../web/record-delta.js';

// Run with an isolated PostgreSQL-compatible database, never production.
export async function verifyNumbering(pg){
 globalThis.RECORD_SCHEMA_SQL=fs.readFileSync(new URL('../postgres/002_record_storage.sql',import.meta.url),'utf8');
 globalThis.NUMBER_SCHEMA_SQL=fs.readFileSync(new URL('../postgres/003_record_numbers.sql',import.meta.url),'utf8');
 await pg.sql.query('CREATE SCHEMA knox');
 await pg.sql.query('CREATE TABLE knox.workspace(id integer PRIMARY KEY,revision integer,data text)');
 await pg.sql.query('CREATE TABLE knox.clinical_records(key text PRIMARY KEY,collection text,record_id text,patient_id text,search_name text,data text,updated text)');
 await pg.sql.query('CREATE TABLE knox.audit(id text,actor text,action text,created text)');
 const empty={patients:[],orders:[],qc:[],analyzers:[],customTests:[],prices:[],sales:[],ultrasoundReports:[],activity:[],testConfig:{}};
 await pg.sql.query('INSERT INTO knox.workspace VALUES(1,0,$1)',[JSON.stringify(empty)]);
 for(const [collection,id,created] of [['patients','Z-old','2020-01-01'],['patients','A-new','2021-01-01'],['orders','O-old','2020-01-01'],['ultrasoundReports','US-old','2020-01-01']]){
  const r={id,name:id,created,...(collection!=='patients'?{patient:'Z-old'}:{})};
  await pg.sql.query('INSERT INTO knox.clinical_records VALUES($1,$2,$3,$4,$5,$6,$7)',[collection+':'+id,collection,id,r.patient||null,id.toLowerCase(),JSON.stringify(r),created]);
 }
 let state=await readRecords(pg);
 assert.deepEqual(state.data.patients.map(p=>[p.id,p.sequenceNumber]),[['Z-old',1],['A-new',2]]);
 assert.equal(state.data.orders[0].sequenceNumber,1);
 assert.equal(state.data.ultrasoundReports[0].sequenceNumber,1);
 assert.equal(state.data.orders[0].patient,'Z-old');
 assert.equal((await readRecords(pg,{collection:'patients',query:'1'})).data.patients[0].id,'Z-old');
 // Linked orders also load their patient for lookup, after the primary page.
 const nextPage=await readRecords(pg,{collection:'patients',after:'Z-old'});assert.equal(nextPage.data.patients[0].id,'A-new');assert.deepEqual(nextPage.pageIds.patients,['A-new']);
 const next=structuredClone(state.data);next.patients.push({id:'B',name:'B',created:'2026-01-01'});next.orders.push({id:'O-new',patient:'B',created:'2026-01-01'});next.ultrasoundReports.push({id:'US-new',patient:'B',created:'2026-01-01'});
 state=await persistDelta(pg,{email:'test'},{revision:state.revision,...recordDelta(state.data,next)},state,next);
 assert.equal(state.data.patients.find(p=>p.id==='B').sequenceNumber,3);
 assert.equal(state.data.orders.find(o=>o.id==='O-new').sequenceNumber,2);
 assert.equal(state.data.ultrasoundReports.find(o=>o.id==='US-new').sequenceNumber,2);
 const edited=structuredClone(state.data);edited.patients[0].sequenceNumber=999;edited.patients[0].phone='edited';
 state=await persistDelta(pg,{email:'test'},{revision:state.revision,...recordDelta(state.data,edited)},state,edited);
 assert.equal(state.data.patients[0].sequenceNumber,1);
 // Rollback must not consume numbers; deletion must not reuse a number.
 await assert.rejects(pg.sql.transaction([
  pg.sql.query("INSERT INTO knox.clinical_records VALUES('patients:rollback','patients','rollback',NULL,'rollback','{\"id\":\"rollback\"}','2026')"),
  pg.sql.query('SELECT 1/0')
 ]));
 assert.equal((await pg.sql.query("SELECT last_number FROM knox.number_counters WHERE collection='patients'"))[0].last_number,3);
 await pg.sql.query("DELETE FROM knox.clinical_records WHERE key='patients:B'");
 await pg.sql.query("INSERT INTO knox.clinical_records VALUES('patients:C','patients','C',NULL,'c','{\"id\":\"C\"}','2026')");
 assert.equal(JSON.parse((await pg.sql.query("SELECT data FROM knox.clinical_records WHERE key='patients:C'"))[0].data).sequenceNumber,4);
 const before=await pg.sql.query('SELECT key,data FROM knox.clinical_records ORDER BY key');
 await pg.sql.transaction(NUMBER_SCHEMA_SQL.split('--> statement-breakpoint').map(s=>pg.sql.query(s)));
 assert.deepEqual(await pg.sql.query('SELECT key,data FROM knox.clinical_records ORDER BY key'),before);
 state=await readRecords(pg);
 const race=await Promise.allSettled(['D','E'].map(id=>{const data=structuredClone(state.data);data.patients.push({id,name:id});return persistDelta(pg,{email:'test'},{revision:state.revision,...recordDelta(state.data,data)},state,data)}));
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(race.find(r=>r.status==='rejected').reason.status,409);
 assert.equal((await pg.sql.query("SELECT last_number FROM knox.number_counters WHERE collection='patients'"))[0].last_number,5);
 console.log('PASS chronological backfill, separate sequences, numeric search/pagination, save response, immutable numbers, rollback, deletion and idempotent migration');
}
