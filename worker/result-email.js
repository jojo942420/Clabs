import {renderLabReport,LAB_REPORT_CSS} from '../shared/lab-report.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const b64=s=>{const bytes=new TextEncoder().encode(s);let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary)};
const wrap=s=>s.match(/.{1,76}/g)?.join('\r\n')||'';
export function prepareResultEmail(order,patient,recipient){
 if(!order?.reviewed)throw Object.assign(new Error('Only validated results can be emailed'),{status:422});
 if(typeof recipient!=='string'||recipient.length>254||! /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(recipient))throw Object.assign(new Error('Enter one valid recipient email address'),{status:400});
 const subject='CLabs — laboratory report '+(order.sequenceNumber??order.id);
 const message='Please find the validated laboratory report attached.\n\nCLabs';
 const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CLabs — Laboratory report</title><style>body{margin:24px;background:#fff}'+LAB_REPORT_CSS+'</style></head><body>'+renderLabReport(order,patient,{logo:typeof REPORT_LOGO==='string'?REPORT_LOGO:''})+'</body></html>';
 const boundary='knox_'+crypto.randomUUID().replaceAll('-','');
 const eml=['To: '+recipient,'Subject: =?UTF-8?B?'+b64(subject)+'?=','MIME-Version: 1.0','X-Unsent: 1','Content-Type: multipart/mixed; boundary="'+boundary+'"','','--'+boundary,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',wrap(b64(message)),'--'+boundary,'Content-Type: text/html; charset=UTF-8; name="laboratory-report.html"','Content-Disposition: attachment; filename="laboratory-report.html"','Content-Transfer-Encoding: base64','',wrap(b64(html)),'--'+boundary+'--',''].join('\r\n');
 return {recipient,subject,message,eml,html,accession:order.sequenceNumber??order.id};
}
