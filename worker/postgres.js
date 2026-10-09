import { neon } from '@neondatabase/serverless';
export const TABLES=['staff','interfaces','messages','audit','workspace','clinical_records'];
const clients=new Map();
export function postgres(url){
 if(clients.has(url))return clients.get(url);
 const sql=neon(url);
 const translate=text=>{let i=0;return text.replace(/CREATE TABLE IF NOT EXISTS staff_access/g,'CREATE TABLE IF NOT EXISTS knox.staff_access').replace(/\?/g,()=>'$'+(++i)).replace(/\b(FROM|INTO|UPDATE|JOIN)\s+(staff|interfaces|messages|audit|workspace|clinical_records|staff_access)\b/gi,'$1 knox.$2')};
 const client={sql,prepare(text){return {bind(...args){const query=translate(text);return {query,args,async first(){return (await sql.query(query,args))[0]||null},async all(){return {results:await sql.query(query,args)}},async run(){return {results:await sql.query(query,args)}}}}}},async batch(statements){return (await sql.transaction(statements.map(s=>sql.query(s.query,s.args)))).map(results=>({results}))}};clients.set(url,client);return client;
}
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const rowsEqual=(a,b)=>canonical(a.map(canonical).sort())===canonical(b.map(canonical).sort());
export async function migrateDatabase(env,pg){
 const existing=(await pg.sql.query('SELECT status,manifest FROM knox.migration_state WHERE id=1'))[0];
 if(existing?.status==='ready')return {alreadyMigrated:true,manifest:existing.manifest};
 const snapshot=await env.DB.batch(TABLES.map(t=>env.DB.prepare('SELECT * FROM '+t).bind()));
 const source=Object.fromEntries(TABLES.map((t,i)=>[t,snapshot[i].results]));
 if(!existing){
 const commands=TABLES.map(t=>pg.sql.query('INSERT INTO knox.'+t+' SELECT * FROM jsonb_populate_recordset(NULL::knox.'+t+',$1::jsonb)',[JSON.stringify(source[t])]));
 const manifest=Object.fromEntries(TABLES.map(t=>[t,source[t].length]));
 commands.push(pg.sql.query("INSERT INTO knox.migration_state(id,status,manifest) VALUES(1,'copied',$1::jsonb)",[JSON.stringify(manifest)]));
 await pg.sql.transaction(commands);
 }
 for(const t of TABLES){const target=await pg.sql.query('SELECT * FROM knox.'+t);if(!rowsEqual(source[t],target))throw new Error('Migration verification failed for '+t)}
 const manifest=Object.fromEntries(TABLES.map(t=>[t,source[t].length]));
 await pg.sql.query("UPDATE knox.migration_state SET status='ready',completed_at=now() WHERE id=1 AND status='copied'");
 return {migrated:true,verified:true,manifest};
}
const readyDatabases=new WeakMap();
export async function databaseReady(pg){if(!readyDatabases.has(pg)){const check=Promise.resolve(pg.sql.query('SELECT status FROM knox.migration_state WHERE id=1')).then(rows=>{const ready=rows[0]?.status==='ready';if(!ready)readyDatabases.delete(pg);return ready}).catch(error=>{readyDatabases.delete(pg);throw error});readyDatabases.set(pg,check)}return readyDatabases.get(pg);}
export async function selectDatabase(env){if(!env.DATABASE_URL)return {env,ready:true};const pg=postgres(env.DATABASE_URL);const ready=await databaseReady(pg);return {env:ready?{...env,DB:pg}:env,ready,pg};}
