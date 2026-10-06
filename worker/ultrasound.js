const fail=message=>{throw Object.assign(new Error(message),{status:422})};
const text=v=>typeof v==='string'&&v.trim().length>0;
export function validateUltrasound(report,data){
 for(const key of ['test','indication','operator','technique','impression','recommendation','clinician','equipment','amendmentReason'])if(report[key]!==undefined&&(typeof report[key]!=='string'||report[key].length>6000))fail('Invalid ultrasound '+key);
 const patient=data.patients.find(p=>p.id===report.patient);
 if(!patient)fail('Select a registered patient for the ultrasound report');
 if(report.department!=='Ultrasound'||!text(report.test)||!report.template?.fields?.length||report.template.fields.length>80)fail('Select an ultrasound report template');
 if(!Array.isArray(report.resultRows)||report.resultRows.length!==report.template.fields.length)fail('Ultrasound findings must match the saved template');
 report.resultRows.forEach((r,i)=>{const f=report.template.fields[i];if(r.name!==f.name||!['Result','Not assessed','Not applicable'].includes(r.state)||typeof r.value!=='string'||r.value.length>6000)fail('Invalid ultrasound finding');if(r.state==='Result'&&r.value&&f.type==='number'&&!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(r.value))fail('Enter a non-negative measurement for '+f.name);if(r.state==='Result'&&r.value&&f.type==='choice'&&!f.options?.includes(r.value))fail('Select a valid finding for '+f.name);});
 if(report.signature&&(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(report.signature)||report.signature.length>200000))fail('Invalid ultrasound signature image');
 if(!report.reviewed)return;
 if(!text(patient.name)||!text(patient.dob)||!text(patient.sex))fail('Complete patient name, date of birth and sex before approving the scan');
 if(!text(report.indication)||!text(report.operator)||!text(report.technique)||!text(report.impression))fail('Record the indication, sonographer, technique and impression before approval');
 const exam=new Date(report.examAt);if(!Number.isFinite(exam.getTime())||exam.getTime()>Date.now()+300000)fail('Record a valid completed examination date and time');
 if(report.identityVerified!==true)fail('Confirm patient identity and review of scan findings before approval');
 for(const row of report.resultRows)if(row.state==='Result'&&!text(row.value))fail('Complete '+row.name+' or explicitly mark it Not assessed / Not applicable');
}
export function prepareUltrasoundChanges(user,current,data){
 for(const report of data.ultrasoundReports){
  const old=current.ultrasoundReports.find(r=>r.id===report.id);if(JSON.stringify(old)===JSON.stringify(report))continue;
  validateUltrasound(report,data);
  if(old?.reviewed){
   if(!report.reviewed)fail('Final ultrasound reports must be corrected through an amendment');
   if(!text(report.amendmentReason))fail('Record the reason for amending the ultrasound report');
   const snapshot=structuredClone(old);delete snapshot.amendments;
   report.amendments=[...(old.amendments||[]),{at:new Date().toISOString(),by:user.name,reason:report.amendmentReason,previous:snapshot}];
  }else report.amendments=old?.amendments||[];
  if(report.reviewed){report.reviewer=user.name;report.reviewerEmail=user.email;report.resultAt=new Date().toISOString();}
  else{report.reviewer='';report.reviewerEmail='';report.resultAt='';report.identityVerified=false;report.signature=null;}
 }
}
