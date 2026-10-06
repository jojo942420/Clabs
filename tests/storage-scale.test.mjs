import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {recordPage,recordStatement} from '../worker/record-store.js';
const db=new DatabaseSync(':memory:');
for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+file,'utf8'));
const env={DB:{prepare:sql=>({bind:(...args)=>({all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>db.prepare(sql).run(...args)})})}};
const insert=db.prepare('INSERT INTO clinical_records(key,collection,record_id,patient_id,search_name,data,updated) VALUES(?,?,?,?,?,?,?)');
db.exec('BEGIN');
for(let i=0;i<300000;i++){const id='P'+String(i).padStart(6,'0'),p={id,name:'Synthetic patient '+i,dob:'1990-01-01',sex:'Male'};insert.run('patients:'+id,'patients',id,null,p.name.toLowerCase(),JSON.stringify(p),'2026-09-26')}
db.exec('COMMIT');
assert.equal(db.prepare('SELECT count(*) AS n FROM clinical_records').get().n,300000);
const first=await recordPage(env,{collection:'patients'});assert.equal(first.items.length,50);assert.equal(first.next,'P000049');
const second=await recordPage(env,{collection:'patients',after:first.next});assert.equal(second.items[0].id,'P000050');
const last=await recordPage(env,{collection:'patients',after:'P299998'});assert.equal(last.items[0].id,'P299999');assert.equal(last.next,null);
await recordStatement(env,'patients',{id:'P000000',name:'Updated synthetic patient'}).run();assert.equal(db.prepare('SELECT count(*) AS n FROM clinical_records').get().n,300000);
assert(db.prepare('EXPLAIN QUERY PLAN SELECT data FROM clinical_records WHERE collection=? AND record_id>? ORDER BY record_id LIMIT 51').all('patients','P100000').some(r=>r.detail.includes('USING INDEX')));
console.log('PASS: 300,000 synthetic patient records; indexed cursor pagination; boundary pages; isolated record update. Local SQLite test only, not hosted capacity certification.');
