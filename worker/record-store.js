// Migration foundation. Not routed into the live application until cutover tests pass.
const collections=new Set(['patients','orders','qc','analyzers','customTests','prices','sales','ultrasoundReports']);
function checkCollection(collection){if(!collections.has(collection))throw new Error('Unknown collection')}
export function recordStatement(env,collection,record){
 checkCollection(collection);
 if(!record||!/^[A-Za-z0-9_-]{1,100}$/.test(record.id))throw new Error('Invalid record ID');
 const data=JSON.stringify(record);
 if(new TextEncoder().encode(data).length>1500000)throw new Error('Move attachments to object storage before migration');
 return env.DB.prepare('INSERT INTO clinical_records(key,collection,record_id,patient_id,search_name,data,updated) VALUES(?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET patient_id=excluded.patient_id,search_name=excluded.search_name,data=excluded.data,updated=excluded.updated').bind(collection+':'+record.id,collection,record.id,record.patient||null,String(record.name||record.test||'').toLowerCase(),data,new Date().toISOString());
}
export async function recordPage(env,{collection,after='',prefix='',patientId=null,limit=50}){
 checkCollection(collection);limit=Math.min(100,Math.max(1,Number(limit)||50));
 let sql='SELECT record_id,data FROM clinical_records WHERE collection=? AND record_id>?',args=[collection,after];
 if(patientId){sql+=' AND patient_id=?';args.push(patientId)}
 if(prefix){sql+=' AND search_name>=? AND search_name<?';args.push(prefix.toLowerCase(),prefix.toLowerCase()+'\uffff')}
 sql+=' ORDER BY record_id LIMIT ?';args.push(limit+1);
 const rows=(await env.DB.prepare(sql).bind(...args).all()).results;
 return {items:rows.slice(0,limit).map(r=>JSON.parse(r.data)),next:rows.length>limit?rows[limit-1].record_id:null};
}
export async function copyLegacyRecords(env,data){
 // Copy only: retain the original workspace and never mark migration complete here.
 let count=0;
 for(const collection of collections){const records=data[collection]||[];for(let i=0;i<records.length;i+=50){await env.DB.batch(records.slice(i,i+50).map(record=>recordStatement(env,collection,record)));count+=Math.min(50,records.length-i)}}
 return count;
}
