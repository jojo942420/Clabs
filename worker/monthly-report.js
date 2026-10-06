import {can,requirePermission} from './permissions.js';
import {ensureRecords} from './record-state.js';
import {testPerformed} from './stock.js';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
export function reportMonth(value){if(typeof value!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)||Number(value.slice(0,4))<1900)fail(400,'Choose a valid report month.');return value}
export const completionTime=r=>r.performedAt||r.resultAt||r.examAt||r.collected||r.created||'';
export function stampCompletionDates(before,after,at){for(const key of ['orders','ultrasoundReports'])for(const row of after[key]||[]){const old=(before[key]||[]).find(r=>r.id===row.id);if(old&&JSON.stringify(old)===JSON.stringify(row))continue;if(old&&testPerformed(old))row.performedAt=old.performedAt||completionTime(old)||at;else if(old?.performedAt)row.performedAt=old.performedAt;else if(testPerformed(row)&&!testPerformed(old))row.performedAt=at;else delete row.performedAt;}}
const projection=r=>Object.fromEntries(['id','patient','sequenceNumber','testId','test','department','specimen','result','unit','resultRows','astRows','astStandard','astVersion','comment','impression','recommendation','reviewed','performedAt','resultAt','examAt','collected','created'].filter(k=>r[k]!==undefined).map(k=>[k,r[k]]));
export function monthlyFromState(state,user,month,after='',revision=null){
 if(revision!==null&&Number(revision)!==Number(state.revision))fail(409,'Records changed while generating this report. Generate the report again.');
 const ultrasound=can(user,'ultrasoundView');const all=['orders',...(ultrasound?['ultrasoundReports']:[])].flatMap(k=>(state.data[k]||[]).filter(r=>testPerformed(r)&&String(completionTime(r)).slice(0,7)===month).map(r=>({key:k+':'+r.id,record:projection(r),patient:state.data.patients.find(p=>p.id===r.patient)||{id:r.patient,name:'Patient record unavailable'}}))).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
 const page=all.filter(r=>r.key>after).slice(0,501),tests=new Map();for(const row of all){const r=row.record,key=(r.department||'Laboratory')+'|'+(r.testId||r.test);if(!tests.has(key))tests.set(key,{name:String(r.test||r.testId||'Unknown test'),department:String(r.department||'Laboratory'),count:0});tests.get(key).count++}
 return {month,revision:state.revision,scope:ultrasound?'Laboratory and ultrasound':'Laboratory',records:page.slice(0,500),next:page.length>500?page[499].key:null,...(!after?{summary:{tests:all.length,patients:new Set(all.map(r=>r.record.patient)).size,final:all.filter(r=>r.record.reviewed).length,draft:all.filter(r=>!r.record.reviewed).length,byTest:[...tests.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name))}}:{})};
}
const initialized=new WeakMap();
const MONTH_SQL="left(coalesce(nullif(data::jsonb->>'performedAt',''),nullif(data::jsonb->>'resultAt',''),nullif(data::jsonb->>'examAt',''),nullif(data::jsonb->>'collected',''),data::jsonb->>'created'),7)";
const PERFORMED_SQL="(CASE WHEN jsonb_typeof(data::jsonb->'resultRows')='array' THEN EXISTS(SELECT 1 FROM jsonb_array_elements(data::jsonb->'resultRows') r WHERE coalesce(r->>'state','Result')='Result' AND length(trim(coalesce(r->>'value','')))>0) ELSE length(trim(coalesce(data::jsonb->>'result','')))>0 END)";
async function ensureIndex(pg){if(!initialized.has(pg))initialized.set(pg,Promise.resolve(pg.sql.query(`CREATE INDEX IF NOT EXISTS clinical_completed_month ON knox.clinical_records ((${MONTH_SQL}),key) WHERE collection IN ('orders','ultrasoundReports')`)).catch(e=>{initialized.delete(pg);throw e}));await initialized.get(pg)}
export async function monthlyReport(env,user,options,legacyState){
 requirePermission(user,'monthlyReports');const month=reportMonth(options.month),after=options.after||'';if(after.length>220)fail(400,'Invalid report cursor');const expected=options.revision===undefined?null:Number(options.revision);if(expected!==null&&(!Number.isSafeInteger(expected)||expected<0))fail(400,'Invalid report revision');
 if(!env.DB.sql)return monthlyFromState(await legacyState(),user,month,after,expected);
 const pg=env.DB;await ensureRecords(pg);await ensureIndex(pg);
 const collections=can(user,'ultrasoundView')?['orders','ultrasoundReports']:['orders'];
 const where=`collection=ANY($1::text[]) AND ${MONTH_SQL}=$2 AND ${PERFORMED_SQL}`;
 const fields=['id','patient','sequenceNumber','testId','test','department','specimen','result','unit','resultRows','astRows','astStandard','astVersion','comment','impression','recommendation','reviewed','performedAt','resultAt','examAt','collected','created'];
 const select=fields.map(k=>`'${k}',c.data::jsonb->'${k}'`).join(',');
 const commands=[pg.sql.query('SELECT revision FROM knox.storage_meta WHERE id=1'),pg.sql.query(`WITH matched AS (SELECT key,data FROM knox.clinical_records WHERE ${where} AND key>$3 ORDER BY key LIMIT 501) SELECT c.key,jsonb_build_object(${select}) AS record,jsonb_build_object('id',p.data::jsonb->'id','sequenceNumber',p.data::jsonb->'sequenceNumber','name',p.data::jsonb->'name','sex',p.data::jsonb->'sex','dob',p.data::jsonb->'dob') AS patient FROM matched c LEFT JOIN knox.clinical_records p ON p.key='patients:'||(c.data::jsonb->>'patient') ORDER BY c.key`,[collections,month,after])];
 if(!after){commands.push(pg.sql.query(`SELECT count(*)::int AS tests,count(DISTINCT data::jsonb->>'patient')::int AS patients,count(*) FILTER(WHERE data::jsonb->>'reviewed'='true')::int AS final FROM knox.clinical_records WHERE ${where}`,[collections,month]));commands.push(pg.sql.query(`SELECT coalesce(data::jsonb->>'test',data::jsonb->>'testId','Unknown test') AS name,coalesce(data::jsonb->>'department','Laboratory') AS department,count(*)::int AS count FROM knox.clinical_records WHERE ${where} GROUP BY coalesce(data::jsonb->>'test',data::jsonb->>'testId','Unknown test'),coalesce(data::jsonb->>'department','Laboratory'),data::jsonb->>'testId' ORDER BY count DESC,name`,[collections,month]));}
 const result=await pg.sql.transaction(commands,{isolationLevel:'RepeatableRead',readOnly:true}),revision=Number(result[0][0]?.revision);if(expected!==null&&expected!==revision)fail(409,'Records changed while generating this report. Generate the report again.');
 const rows=result[1],totals=result[2]?.[0];return {month,revision,scope:collections.length===2?'Laboratory and ultrasound':'Laboratory',records:rows.slice(0,500),next:rows.length>500?rows[499].key:null,...(totals?{summary:{...totals,draft:totals.tests-totals.final,byTest:result[3]}}:{})};
}

export function ultrasoundSummaryFromState(state,month){
 const rows=(state.data.ultrasoundReports||[]).filter(r=>testPerformed(r)&&String(completionTime(r)).slice(0,7)===month),counts=new Map();
 for(const r of rows){const key=r.testId||r.test||'Unknown scan';if(!counts.has(key))counts.set(key,{name:String(r.test||r.testId||'Unknown scan'),count:0});counts.get(key).count++}
 const final=rows.filter(r=>r.reviewed).length;
 return {month,summary:{scans:rows.length,patients:new Set(rows.map(r=>r.patient)).size,final,draft:rows.length-final,byScan:[...counts.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name))}};
}
export async function ultrasoundSummary(env,user,value,legacyState){
 requirePermission(user,'ultrasoundView');const month=reportMonth(value);
 if(!env.DB.sql)return ultrasoundSummaryFromState(await legacyState(),month);
 const pg=env.DB;await ensureRecords(pg);await ensureIndex(pg);
 const where=`collection='ultrasoundReports' AND ${MONTH_SQL}=$1 AND ${PERFORMED_SQL}`;
 const result=await pg.sql.transaction([
  pg.sql.query(`SELECT count(*)::int AS scans,count(DISTINCT data::jsonb->>'patient')::int AS patients,count(*) FILTER(WHERE data::jsonb->>'reviewed'='true')::int AS final FROM knox.clinical_records WHERE ${where}`,[month]),
  pg.sql.query(`SELECT coalesce(data::jsonb->>'test',data::jsonb->>'testId','Unknown scan') AS name,count(*)::int AS count FROM knox.clinical_records WHERE ${where} GROUP BY coalesce(data::jsonb->>'test',data::jsonb->>'testId','Unknown scan'),data::jsonb->>'testId' ORDER BY count DESC,name`,[month])
 ],{isolationLevel:'RepeatableRead',readOnly:true});
 const totals=result[0][0];return {month,summary:{...totals,draft:totals.scans-totals.final,byScan:result[1]}};
}
