const recordCollections=['patients','orders','qc','analyzers','customTests','prices','sales','ultrasoundReports'];
const makeScope=data=>Object.fromEntries(recordCollections.map(k=>[k,data[k].map(r=>r.id)]));
async function ensureRecordStorage(env){
 if(await q(env,'SELECT id FROM storage_meta WHERE id=1').first())return;
 await q(env,'INSERT INTO workspace(id,revision,data) VALUES(1,0,?) ON CONFLICT(id) DO NOTHING',JSON.stringify(initialData())).run();
 const commands=recordCollections.map(k=>q(env,`INSERT OR IGNORE INTO clinical_records(key,collection,record_id,patient_id,search_name,data,updated) SELECT ? || ':' || json_extract(j.value,'$.id'),?,json_extract(j.value,'$.id'),json_extract(j.value,'$.patient'),lower(coalesce(json_extract(j.value,'$.name'),json_extract(j.value,'$.test'),'')),j.value,? FROM workspace w,json_each(w.data,?) j WHERE w.id=1 AND NOT EXISTS(SELECT 1 FROM storage_meta WHERE id=1)`,k,k,now(),'$.'+k));
 commands.push(q(env,"INSERT OR IGNORE INTO storage_meta(id,revision,settings,activity) SELECT 1,revision,coalesce(json_extract(data,'$.testConfig'),'{}'),coalesce(json_extract(data,'$.activity'),'[]') FROM workspace WHERE id=1"));
 commands.push(q(env,'INSERT OR IGNORE INTO storage_guard(id,revision) VALUES(1,0)'));
 await env.DB.batch(commands);
}
async function scaledState(env,scope=null,options={}){
 await ensureRecordStorage(env);
 const commands=[q(env,'SELECT revision,settings,activity FROM storage_meta WHERE id=1')];
 for(const k of recordCollections){
  if(scope){const ids=scope[k]||[];if(!Array.isArray(ids)||ids.length>1500||ids.some(id=>typeof id!=='string'))fail(400,'Invalid record scope');commands.push(q(env,'SELECT data FROM clinical_records WHERE collection=? AND record_id IN (SELECT value FROM json_each(?)) ORDER BY updated DESC,record_id',k,JSON.stringify(ids)));continue}
  let sql='SELECT data FROM clinical_records WHERE collection=?',args=[k];
  if(options.collection===k){if(options.patientId){sql+=' AND patient_id=?';args.push(options.patientId)}if(options.requestId){sql+=" AND json_extract(data,'$.requestId')=?";args.push(options.requestId)}if(options.query){sql+=' AND (search_name>=? AND search_name<? OR record_id=?)';args.push(options.query.toLowerCase(),options.query.toLowerCase()+'\uffff',options.query)}if(options.after){sql+=' AND record_id>?';args.push(options.after)}sql+=' ORDER BY record_id LIMIT 101'}
  else sql+=' ORDER BY record_id LIMIT '+(['customTests','prices','analyzers'].includes(k)?1500:51);
  commands.push(q(env,sql,...args));
 }
 const result=await env.DB.batch(commands),meta=result[0].results[0],data=initialData(),pagination={};
 for(let i=0;i<recordCollections.length;i++){const k=recordCollections[i],rows=result[i+1].results.map(r=>JSON.parse(r.data));const limit=options.collection===k?100:['customTests','prices','analyzers'].includes(k)?1500:50;data[k]=scope?rows:rows.slice(0,limit);pagination[k]=!scope&&rows.length>limit?data[k].at(-1).id:null}
 data.testConfig=JSON.parse(meta.settings);data.activity=JSON.parse(meta.activity);
 const ids=[...new Set([...data.orders,...data.sales,...data.ultrasoundReports].map(r=>r.patient).filter(Boolean))].filter(id=>!data.patients.some(p=>p.id===id));
 if(ids.length){const refs=await q(env,"SELECT data FROM clinical_records WHERE collection='patients' AND record_id IN (SELECT value FROM json_each(?))",JSON.stringify(ids)).all();data.patients.push(...refs.results.map(r=>JSON.parse(r.data)))}
 const end=await q(env,'SELECT revision FROM storage_meta WHERE id=1').first();if(end.revision!==meta.revision)fail(409,'Records changed while loading. Please reload.');
 return {revision:meta.revision,data,scope:makeScope(data),pagination,storageVersion:2};
}
async function persistRecordState(env,user,payload,current){
 const commands=[q(env,'UPDATE storage_guard SET revision=(SELECT revision+1 FROM storage_meta WHERE id=1 AND revision=?) WHERE id=1',payload.revision)];
 for(const k of recordCollections){const old=new Map(current.data[k].map(r=>[r.id,r])),next=new Map(payload.data[k].map(r=>[r.id,r]));
  for(const record of payload.data[k]){if(equal(record,old.get(record.id)))continue;const bytes=JSON.stringify(record);if(new TextEncoder().encode(bytes).length>1500000)fail(413,'Record too large. Store large attachments in cloud file storage.');commands.push(q(env,'INSERT INTO clinical_records(key,collection,record_id,patient_id,search_name,data,updated) VALUES(?,?,?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET patient_id=excluded.patient_id,search_name=excluded.search_name,data=excluded.data,updated=excluded.updated',k+':'+record.id,k,record.id,record.patient||null,String(record.name||record.test||'').toLowerCase(),bytes,now()))}
  for(const record of current.data[k])if(!next.has(record.id)){
   if(k==='patients'){const linked=await q(env,"SELECT key FROM clinical_records WHERE patient_id=? LIMIT 1",record.id).first();if(linked)fail(422,'Patient has clinical or financial records and cannot be deleted')}
   if(k==='orders'){const linked=await q(env,"SELECT key FROM clinical_records WHERE collection='sales' AND json_extract(data,'$.orderId')=? LIMIT 1",record.id).first();if(linked)fail(422,'Order has financial records and cannot be deleted')}
   commands.push(q(env,'DELETE FROM clinical_records WHERE key=?',k+':'+record.id));
  }
 }
 commands.push(q(env,'UPDATE storage_meta SET revision=revision+1,settings=?,activity=? WHERE id=1',JSON.stringify(payload.data.testConfig),JSON.stringify(payload.data.activity.slice(0,20))));
 commands.push(q(env,'INSERT INTO audit(id,actor,action,created) VALUES(?,?,?,?)',id(),user.email,'Saved scoped laboratory records (revision '+(payload.revision+1)+')',now()));
 if(commands.length>500)fail(413,'Too many simultaneous edits. Save smaller batches.');
 try{await env.DB.batch(commands)}catch(e){if(String(e.message).includes('NOT NULL'))fail(409,'Another staff member saved changes. Reload before saving.');throw e}
 return {revision:payload.revision+1,data:payload.data,scope:makeScope(payload.data),storageVersion:2};
}
