import {generatedSop,eligibleQc,GHANA_QC_REFERENCES,QC_SOP_SOURCE} from '../shared/qc-sop.js';
const fail=message=>{throw Object.assign(new Error(message),{status:422})};
export function stampQualityRecords(before,after,user){
 for(const [testId,config] of Object.entries(after.testConfig)){
  const s=config.qcSop,old=before.testConfig[testId]?.qcSop;if(!s||JSON.stringify(s)===JSON.stringify(old))continue;
  if(!s.changeReason?.trim()||s.changeReason.trim().length<3)fail('Provide a reason for the SOP change');
  for(const key of ['code','version','title','method','procedure','controls','levels','criteria','frequency','reference'])if(typeof s[key]!=='string'||s[key].length>12000)fail('Invalid SOP '+key);
  if(!['Draft','Approved'].includes(s.status)||!Number.isFinite(Number(s.validHours))||s.validHours<1||s.validHours>744)fail('Invalid SOP status or QC validity period');
  if(s.status==='Approved'&&['version','method','procedure','controls','levels','criteria','frequency','reference'].some(k=>!s[k].trim()))fail('Complete the method, procedure, controls, criteria, frequency and source before approving the SOP');
  s.source=QC_SOP_SOURCE;s.ghanaReferences=GHANA_QC_REFERENCES;
  s.updatedAt=new Date().toISOString();s.updatedBy=user.email;s.approvedBy=s.status==='Approved'?user.email:'';s.approvedAt=s.status==='Approved'?s.updatedAt:'';
 }
 for(const q of after.qc){const old=before.qc.find(r=>r.id===q.id);if(!q.testId||JSON.stringify(old)===JSON.stringify(q))continue;
  for(const key of ['testId','runId','analyzer','level','value','criteria','acceptance','performedAt'])if(typeof q[key]!=='string'||!q[key].trim()||q[key].length>2000)fail('Complete QC '+key);
  if(!['Pending','Accepted','Rejected'].includes(q.acceptance)||!Number.isFinite(new Date(q.performedAt).getTime())||new Date(q.performedAt).getTime()>Date.now()+300000)fail('Invalid QC assessment or performed time');
  const sop=after.testConfig[q.testId]?.qcSop;q.sopCode=sop?.code||'';q.sopVersion=sop?.version||'';q.recordedBy=user.email;q.acceptedBy=q.acceptance==='Accepted'?user.email:'';q.assessedAt=new Date().toISOString();
 }
}
export async function qcRecords(env,testId,fallback){
 if(env.DB.sql){const rows=await env.DB.sql.query("SELECT data FROM knox.clinical_records WHERE collection='qc' AND data::jsonb->>'testId'=$1 ORDER BY updated DESC LIMIT 1000",[testId]);return rows.map(r=>JSON.parse(r.data));}
 return fallback.qc.filter(q=>q.testId===testId);
}
export async function attachQualityEvidence(env,order,data){
 order.clinicalReview??={};
 const sop=data.testConfig[order.testId]?.qcSop||generatedSop({id:order.testId||order.id,name:order.test,department:order.department,specimen:order.specimen,template:order.template});
 const rows=await qcRecords(env,order.testId,data),qc=eligibleQc(sop,order.testId,order.method||order.equipment,rows);
 if(sop.status==='Approved'&&!qc.length)fail('Record an accepted QC run for this test / method and all required controls before approval');
 order.clinicalReview.quality={sop:structuredClone(sop),qc:qc.map(q=>structuredClone(q)),linkedAt:new Date().toISOString()};
 if(qc.length)order.clinicalReview.evidence=sop.code+' v'+sop.version+' · QC '+qc.map(q=>q.id).join(', ');
}
