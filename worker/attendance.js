import {requirePermission} from './permissions.js';
const ready=new WeakMap();
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const table=env=>env.DB.sql?'knox.staff_attendance':'staff_attendance';
const query=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
async function ensure(env){
 if(!ready.has(env.DB))ready.set(env.DB,(async()=>{
  await query(env,`CREATE TABLE IF NOT EXISTS ${table(env)} (id TEXT PRIMARY KEY, staff_name TEXT NOT NULL, arrival_at TEXT NOT NULL, recorded_by TEXT NOT NULL, created_at TEXT NOT NULL)`).run();
  await query(env,`CREATE INDEX IF NOT EXISTS staff_attendance_arrival_idx ON ${table(env)} (arrival_at DESC,id DESC)`).run();
 })().catch(error=>{ready.delete(env.DB);throw error}));
 await ready.get(env.DB);
}
export async function listAttendance(env,user,date){
 requirePermission(user,'attendance');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)fail(400,'Choose a valid attendance date.');
 await ensure(env);
 const start=date+'T00:00:00.000Z',end=new Date(Date.parse(start)+86400000).toISOString();
 const rows=(await query(env,`SELECT id,staff_name,arrival_at,recorded_by,created_at FROM ${table(env)} WHERE arrival_at>=? AND arrival_at<? ORDER BY arrival_at DESC,id DESC LIMIT 201`,start,end).all()).results;
 const previous=(await query(env,`SELECT DISTINCT staff_name FROM ${table(env)} ORDER BY staff_name LIMIT 200`).all()).results;
 const staff=(await query(env,'SELECT name FROM staff WHERE active=1 ORDER BY name').all()).results;
 return {date,entries:rows.slice(0,200),hasMore:rows.length>200,names:[...new Set([user.name,...staff.map(x=>x.name),...previous.map(x=>x.staff_name)])].sort()};
}
export async function recordAttendance(env,user,b){
 requirePermission(user,'attendance');
 const name=String(b.name||'').trim(),arrival=String(b.arrivalAt||''),timestamp=Date.parse(arrival);
 if(!name||name.length>100||/[\x00-\x1f\x7f]/.test(name))fail(400,'Enter a staff name of 1–100 characters.');
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(arrival)||!Number.isFinite(timestamp)||new Date(timestamp).toISOString().slice(0,10)!==arrival.slice(0,10)||timestamp>Date.now()+300000)fail(400,'Enter a valid arrival time that is not in the future.');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.id||''))fail(400,'Invalid attendance entry ID.');
 await ensure(env);
 const at=new Date(timestamp).toISOString(),created=new Date().toISOString();
 await query(env,`INSERT INTO ${table(env)} (id,staff_name,arrival_at,recorded_by,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING`,b.id,name,at,user.email,created).run();
 const entry=await query(env,`SELECT id,staff_name,arrival_at,recorded_by,created_at FROM ${table(env)} WHERE id=?`,b.id).first();
 if(entry.staff_name!==name||entry.arrival_at!==at||entry.recorded_by!==user.email)fail(409,'This attendance entry ID was already used. Open a new arrival form.');
 return {entry};
}
