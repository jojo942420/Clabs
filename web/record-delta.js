export const RECORD_COLLECTIONS=['patients','orders','qc','analyzers','customTests','prices','sales','ultrasoundReports'];
export function recordDelta(base,next){
 const changes={},scope={};
 for(const k of RECORD_COLLECTIONS){const before=new Map((base[k]||[]).map(r=>[r.id,r])),after=new Map((next[k]||[]).map(r=>[r.id,r]));scope[k]=[...before.keys()];const upsert=[...after.values()].filter(r=>JSON.stringify(r)!==JSON.stringify(before.get(r.id))),remove=[...before.keys()].filter(id=>!after.has(id));if(upsert.length||remove.length)changes[k]={upsert,remove};}
 const out={scope,changes};if(JSON.stringify(base.testConfig)!==JSON.stringify(next.testConfig))out.testConfig=next.testConfig;if(JSON.stringify(base.activity)!==JSON.stringify(next.activity))out.activity=next.activity;return out;
}
