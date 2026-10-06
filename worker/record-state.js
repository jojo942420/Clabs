import {stockConsumption} from './stock.js';
// PostgreSQL record storage: bounded pages and atomic, revision-checked deltas.
export const COLLECTIONS=['patients','orders','qc','analyzers','customTests','prices','sales','ultrasoundReports'];
const configCollections=['analyzers','customTests','prices'];
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const empty=()=>Object.fromEntries([...COLLECTIONS.map(k=>[k,[]]),['testConfig',{}],['activity',[]]]);
export const scopeOf=data=>Object.fromEntries(COLLECTIONS.map(k=>[k,(data[k]||[]).map(r=>r.id)]));
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id);
export function validateScope(scope){if(!scope||typeof scope!=='object'||Array.isArray(scope))fail(400,'Refresh the website to load paginated records');for(const k of Object.keys(scope))if(!COLLECTIONS.includes(k))fail(400,'Unknown record collection');for(const k of COLLECTIONS)if(!Array.isArray(scope[k])||scope[k].length>2000||scope[k].some(id=>!validId(id)))fail(400,'Invalid record scope');return scope}
export function applyDelta(current,payload){
 if(!payload.changes||typeof payload.changes!=='object')fail(409,'Refresh the website before saving. Your old page uses whole-workspace storage.');
 const next=structuredClone(current.data);let count=0;
 for(const k of Object.keys(payload.changes))if(!COLLECTIONS.includes(k))fail(400,'Unknown record collection');
 for(const k of COLLECTIONS){const change=payload.changes[k]||{upsert:[],remove:[]};if(!Array.isArray(change.upsert)||!Array.isArray(change.remove))fail(400,'Invalid record changes');count+=change.upsert.length+change.remove.length;
 const records=new Map(next[k].map(r=>[r.id,r]));
 for(const id of change.remove){if(!validId(id)||!payload.scope[k].includes(id))fail(400,'Deletion outside loaded records');records.delete(id)}
 for(const record of change.upsert){if(!record||!validId(record.id)||change.remove.includes(record.id))fail(400,'Invalid changed record');records.set(record.id,record)}
 if(new Set(change.upsert.map(r=>r.id)).size!==change.upsert.length)fail(400,'Duplicate changed records');next[k]=[...records.values()];
 }
 if(count>200)fail(413,'Save up to 200 record changes at a time. The database has no total-record cap.');
 if(Object.hasOwn(payload,'testConfig'))next.testConfig=payload.testConfig;
 if(Object.hasOwn(payload,'activity'))next.activity=payload.activity;
 return next;
}
export async function initializeRecords(pg){
 // Idempotent migration SQL is bundled at build time and source-controlled.
 await pg.sql.transaction(RECORD_SCHEMA_SQL.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(s=>pg.sql.query(s)));
 const ready=(await pg.sql.query('SELECT revision FROM knox.storage_meta WHERE id=1'))[0];if(ready)return;
 const commands=[pg.sql.query('SELECT id FROM knox.workspace WHERE id=1 FOR UPDATE')];
 for(const k of COLLECTIONS)commands.push(pg.sql.query(`INSERT INTO knox.clinical_records(key,collection,record_id,patient_id,search_name,data,updated) SELECT $1||':'||(r->>'id'),$1,r->>'id',r->>'patient',lower(coalesce(r->>'name',r->>'test','')),r::text,now()::text FROM knox.workspace w CROSS JOIN LATERAL jsonb_array_elements(coalesce(w.data::jsonb->$1,'[]'::jsonb)) r WHERE w.id=1 AND NOT EXISTS(SELECT 1 FROM knox.storage_meta WHERE id=1) ON CONFLICT(key) DO UPDATE SET data=excluded.data,patient_id=excluded.patient_id,search_name=excluded.search_name,updated=excluded.updated`,[k]));
 commands.push(pg.sql.query("INSERT INTO knox.storage_meta(id,revision,settings,activity) SELECT 1,revision,coalesce(data::jsonb->'testConfig','{}'::jsonb)::text,coalesce(data::jsonb->'activity','[]'::jsonb)::text FROM knox.workspace WHERE id=1 ON CONFLICT(id) DO NOTHING"));
 commands.push(pg.sql.query('INSERT INTO knox.storage_guard(id,revision) VALUES(1,0) ON CONFLICT(id) DO NOTHING'));
 await pg.sql.transaction(commands);
}
const initialized=new WeakMap();
export async function ensureRecords(pg){if(!initialized.has(pg)){const ready=initializeRecords(pg).then(()=>pg.sql.transaction(NUMBER_SCHEMA_SQL.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(s=>pg.sql.query(s)))).catch(error=>{initialized.delete(pg);throw error});initialized.set(pg,ready)}await initialized.get(pg)}
export async function readRecords(pg,{scope=null,collection=null,after='',query='',patientId='',requestId='',orderId='',status=''}={}){
 await ensureRecords(pg);if(scope)validateScope(scope);if(collection&&!COLLECTIONS.includes(collection))fail(400,'Unknown collection');
 if(query.length>100||after.length>100)fail(400,'Search is too long');
 const commands=[pg.sql.query('SELECT revision,settings,activity FROM knox.storage_meta WHERE id=1')],limits={};
 for(const k of COLLECTIONS){let text='SELECT data FROM knox.clinical_records WHERE collection=$1',args=[k];
 const add=(clause,value)=>{args.push(value);text+=' AND '+clause.replaceAll('?', '$'+args.length)};
 if(scope)add('record_id=ANY(?::text[])',scope[k]);
 else{
 if(k===collection){if(after){if(['patients','orders','ultrasoundReports'].includes(k))add("(data::jsonb->>'sequenceNumber')::bigint>(SELECT (data::jsonb->>'sequenceNumber')::bigint FROM knox.clinical_records WHERE key=?)",k+':'+after);else add('record_id>?',after);}if(query){args.push(query.toLowerCase().replace(/[\\%_]/g,'\\$&')+'%',query);text+=' AND (search_name LIKE $'+(args.length-1)+' OR record_id=$'+args.length+(['patients','orders','ultrasoundReports'].includes(k)&&/^\d{1,15}$/.test(query)?" OR (data::jsonb->>'sequenceNumber')::bigint=$"+args.length+'::bigint':'')+')';}if(patientId)add('patient_id=?',patientId);if(requestId)add("data::jsonb->>'requestId'=?",requestId);if(orderId)add('record_id=?',orderId);if(status==='reviewed')text+=" AND data::jsonb->>'reviewed'='true'";if(status==='received')text+=" AND data::jsonb->>'received'='true'";}
 limits[k]=configCollections.includes(k)?1500:50;
 }
 text+=['patients','orders','ultrasoundReports'].includes(k)?" ORDER BY (data::jsonb->>'sequenceNumber')::bigint":' ORDER BY record_id';if(!scope)text+=' LIMIT '+(limits[k]+1);commands.push(pg.sql.query(text,args));
 }
 const results=await pg.sql.transaction(commands,{isolationLevel:'RepeatableRead',readOnly:true});const meta=results[0][0];if(!meta)fail(503,'Record storage is not initialized');const data=empty(),pagination={};
 COLLECTIONS.forEach((k,i)=>{const rows=results[i+1].map(r=>JSON.parse(r.data));data[k]=scope?rows:rows.slice(0,limits[k]);pagination[k]=!scope&&rows.length>limits[k]?data[k].at(-1).id:null});
 const pageIds=scopeOf(data);
 data.testConfig=JSON.parse(meta.settings);data.activity=JSON.parse(meta.activity);
 const refs=[...new Set([...data.orders,...data.sales,...data.ultrasoundReports].map(r=>r.patient).filter(Boolean))].filter(id=>!data.patients.some(p=>p.id===id));
 if(refs.length){const rows=await pg.sql.query("SELECT data FROM knox.clinical_records WHERE collection='patients' AND record_id=ANY($1::text[])",[refs]);data.patients.push(...rows.map(r=>JSON.parse(r.data)))}
 const orderRefs=[...new Set(data.sales.map(s=>s.orderId).filter(Boolean))].filter(id=>!data.orders.some(o=>o.id===id));
 if(orderRefs.length){const rows=await pg.sql.query("SELECT data FROM knox.clinical_records WHERE collection='orders' AND record_id=ANY($1::text[])",[orderRefs]);data.orders.push(...rows.map(r=>JSON.parse(r.data)))}
 const end=(await pg.sql.query('SELECT revision FROM knox.storage_meta WHERE id=1'))[0];if(end.revision!==meta.revision)fail(409,'Workspace changed while loading. Retry.');
 return {revision:meta.revision,data,scope:scopeOf(data),pagination,pageIds,storageVersion:3};
}
export async function prepareDelta(pg,payload){
 validateScope(payload.scope);
 const scope=structuredClone(payload.scope);
 for(const k of COLLECTIONS){const rows=payload.changes?.[k]?.upsert||[];if(!Array.isArray(rows)||rows.length>200)fail(400,'Invalid changes');scope[k]=[...new Set([...scope[k],...rows.map(r=>r?.id)])]}
 const current=await readRecords(pg,{scope});if(current.revision!==payload.revision)fail(409,'Another staff member changed the workspace. Reload before saving.');
 const data=applyDelta(current,payload);
 // Include referenced existing records for validation, without rewriting or deleting unrelated rows.
 const patients=[...new Set([...data.orders,...data.sales,...data.ultrasoundReports].map(r=>r.patient).filter(Boolean))].filter(id=>!data.patients.some(p=>p.id===id));
 if(patients.length){const r=await pg.sql.query("SELECT data FROM knox.clinical_records WHERE collection='patients' AND record_id=ANY($1::text[])",[patients]);for(const row of r){const p=JSON.parse(row.data);if(!payload.changes?.patients?.remove?.includes(p.id)){data.patients.push(p);if(!current.data.patients.some(x=>x.id===p.id))current.data.patients.push(p)}}}
 return {current,data};
}
export async function persistDelta(pg,user,payload,current,data){
 const commands=[pg.sql.query('WITH changed AS (UPDATE knox.storage_meta SET revision=revision+1 WHERE id=1 AND revision=$1 RETURNING revision) UPDATE knox.storage_guard SET revision=(SELECT revision FROM changed) WHERE id=1',[payload.revision])];
 for(const k of COLLECTIONS){const old=new Map(current.data[k].map(r=>[r.id,r])),next=new Map(data[k].map(r=>[r.id,r]));
 for(const r of (['patients','orders','ultrasoundReports'].includes(k)?[...data[k]].reverse().sort((a,b)=>String(a.created||'').localeCompare(String(b.created||''))):data[k])){if(JSON.stringify(r)===JSON.stringify(old.get(r.id)))continue;const text=JSON.stringify(r);if(new TextEncoder().encode(text).length>1500000)fail(413,'This record is too large. Reduce its attachments.');commands.push(pg.sql.query('INSERT INTO knox.clinical_records(key,collection,record_id,patient_id,search_name,data,updated) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(key) DO UPDATE SET data=excluded.data,patient_id=excluded.patient_id,search_name=excluded.search_name,updated=excluded.updated RETURNING collection,record_id,data',[k+':'+r.id,k,r.id,r.patient||null,String(r.name||r.test||'').toLowerCase(),text,new Date().toISOString()]))}
 for(const r of current.data[k])if(!next.has(r.id)){
 if(k==='patients'&&(await pg.sql.query('SELECT key FROM knox.clinical_records WHERE patient_id=$1 LIMIT 1',[r.id])).length)fail(422,'Patient has linked records and cannot be deleted');
 if(k==='orders'&&(await pg.sql.query("SELECT key FROM knox.clinical_records WHERE collection='sales' AND data::jsonb->>'orderId'=$1 LIMIT 1",[r.id])).length)fail(422,'Order has financial records and cannot be deleted');
 commands.push(pg.sql.query('DELETE FROM knox.clinical_records WHERE key=$1',[k+':'+r.id]));}
 }
 const stockCommands=await stockConsumption({DB:pg},user,current.data,data);commands.push(...stockCommands.map(c=>pg.sql.query(c.query,c.args)));
 commands.push(pg.sql.query('UPDATE knox.storage_meta SET settings=$1,activity=$2 WHERE id=1',[JSON.stringify(data.testConfig),JSON.stringify(data.activity.slice(0,20))]));
 commands.push(pg.sql.query('INSERT INTO knox.audit(id,actor,action,created) VALUES($1,$2,$3,$4)',[crypto.randomUUID(),user.email,'Saved record changes (revision '+(payload.revision+1)+')',new Date().toISOString()]));
 try{const saved=await pg.sql.transaction(commands);for(const result of saved)for(const row of result){if(row.record_id&&row.data){const record=data[row.collection].find(r=>r.id===row.record_id);if(record)Object.assign(record,JSON.parse(row.data));}}}catch(e){if(e.code==='23502')fail(409,'Workspace changed. Reload before saving.');if(e.code==='23505')fail(409,'A matching record or active receipt already exists. Reload before saving.');throw e}
 for(const k of ['patients','orders','ultrasoundReports'])data[k].sort((a,b)=>a.sequenceNumber-b.sequenceNumber);
 return {revision:payload.revision+1,data,scope:scopeOf(data),storageVersion:3};
}
export async function recordSummary(pg,includeFinance=true){
 const rows=await pg.sql.query(`SELECT collection,count(*)::int AS count FROM knox.clinical_records GROUP BY collection`);
 if(!includeFinance)return {counts:Object.fromEntries(rows.filter(r=>r.collection!=='sales').map(r=>[r.collection,r.count]))};
 const finance=(await pg.sql.query(`SELECT coalesce(sum((data::jsonb->>'total')::numeric) FILTER(WHERE data::jsonb->>'status'='Paid' AND (data::jsonb->>'created')::timestamptz>=date_trunc('week',now())),0) AS week,coalesce(sum((data::jsonb->>'total')::numeric) FILTER(WHERE data::jsonb->>'status'='Paid' AND (data::jsonb->>'created')::timestamptz>=date_trunc('month',now())),0) AS month,coalesce(sum((data::jsonb->>'total')::numeric) FILTER(WHERE data::jsonb->>'status'='Paid' AND (data::jsonb->>'created')::timestamptz>=date_trunc('year',now())),0) AS year,coalesce(sum((data::jsonb->>'total')::numeric) FILTER(WHERE data::jsonb->>'status'='Pending'),0) AS pending FROM knox.clinical_records WHERE collection='sales'`))[0];
 return {counts:Object.fromEntries(rows.map(r=>[r.collection,r.count])),finance};
}
export async function receiptRecords(pg,orderId){
 const row=(await pg.sql.query("SELECT data FROM knox.clinical_records WHERE collection='orders' AND record_id=$1",[orderId]))[0];if(!row)fail(404,'Order not found');const order=JSON.parse(row.data);
 const orders=order.requestId?await pg.sql.query("SELECT record_id FROM knox.clinical_records WHERE collection='orders' AND patient_id=$1 AND data::jsonb->>'requestId'=$2 ORDER BY record_id LIMIT 201",[order.patient,order.requestId]):[{record_id:order.id}];
 if(orders.length>200)fail(422,'This request exceeds 200 orders. Split it into smaller requests before invoicing.');
 const ids=orders.map(o=>o.record_id),sales=await pg.sql.query("SELECT record_id FROM knox.clinical_records WHERE collection='sales' AND data::jsonb->>'orderId'=ANY($1::text[]) ORDER BY record_id LIMIT 2001",[ids]);
 if(sales.length>2000)fail(422,'This request has too many historical receipts for one operation.');
 const base=await readRecords(pg);const scope=scopeOf(base.data);scope.orders=ids;scope.sales=sales.map(r=>r.record_id);scope.patients=[order.patient];return readRecords(pg,{scope});
}
