import {test} from 'node:test';import assert from 'node:assert/strict';import {prepareResultEmail} from '../worker/result-email.js';
const order={id:'O1',test:'LFT',reviewed:true,reviewer:'Scientist',resultRows:[{name:'ALT',state:'Result',value:'20',unit:'U/L',reference:'Lab-approved',flag:''}],comment:'<script>alert(1)</script>'};
test('only reviewed results and a single valid email recipient are accepted',()=>{assert.throws(()=>prepareResultEmail({...order,reviewed:false},{},'a@example.com'));assert.throws(()=>prepareResultEmail(order,{},'a@example.com\r\nBcc: b@example.com'));assert.throws(()=>prepareResultEmail(order,{},'a@example.com,b@example.com'))});
test('draft contains UTF-8 report attachment, reference interval and escaped clinical text',()=>{const d=prepareResultEmail(order,{id:'P1',name:'Patient Ω'},'a@example.com');assert.match(d.eml,/X-Unsent: 1/);assert.match(d.eml,/Content-Disposition: attachment/);assert.match(d.html,/Patient Ω/);assert.match(d.html,/Lab-approved/);assert.doesNotMatch(d.html,/<script>/);assert.match(d.html,/&lt;script&gt;/)});

import {renderLabReport,orderedReportRows} from '../shared/lab-report.js';
test('printed and emailed results follow the saved template order without changing data',()=>{
 const o={...order,template:{fields:[{name:'Albumin'},{name:'ALT'}]},resultRows:[{name:'ALT',state:'Result',value:'20',unit:'U/L'},{name:'Albumin',state:'Result',value:'40',unit:'g/L'},{name:'Additional finding',state:'Result',value:'None'}]};
 const before=JSON.stringify(o);assert.deepEqual(orderedReportRows(o).map(r=>r.name),['Albumin','ALT','Additional finding']);
 const html=renderLabReport(o,{name:'Synthetic test patient',id:'P1'});
 assert(html.indexOf('>Albumin<')<html.indexOf('>ALT<'));assert.equal(JSON.stringify(o),before);
 const email=prepareResultEmail(o,{name:'Synthetic test patient',id:'P1'},'a@example.com');assert.match(email.subject,/CLabs/);assert.doesNotMatch(email.subject,/Knox/);assert.match(email.html,/lab-report/);
});
test('report retains narrative comments, susceptibility, review and signature details safely',()=>{
 const o={...order,astStandard:'EUCAST',astVersion:'2026',astRows:[{isolate:'Test isolate',agent:'Test agent',mic:'<2',zone:'20',interpretation:'I'}],reviewerEmail:'reviewer@example.com',signature:'data:image/png;base64,AA==',clinicalReview:{verifiedAt:'2026-10-03T10:00:00Z',verifiedBy:'reviewer@example.com',evidence:'SOP / QC test'},resultRows:[{name:'Test <parameter>',state:'Not performed',value:'123',unit:'mg/L'}],comment:'Line one\nLine two <unsafe>'};
 const html=renderLabReport(o,{name:'Test & patient',id:'P1'});assert.match(html,/Not performed/);assert.doesNotMatch(html,/>123</);assert.match(html,/&lt;2/);assert.match(html,/increased exposure/);assert.match(html,/Reviewer signature/);assert.match(html,/SOP \/ QC test/);assert.match(html,/Line one\nLine two &lt;unsafe&gt;/);assert.match(html,/Test &amp; patient/);
});

test('report heading is uppercase with no status badge, reviewer email or footer',()=>{
 const o={...order,reviewerEmail:'private-reviewer@example.com',clinicalReview:{verifiedBy:'private-reviewer@example.com',verifiedAt:'2026-10-03T10:00:00Z',evidence:'Test SOP'}};
 const html=renderLabReport(o,{name:'Test patient',id:'P1'});
 assert.match(html,/>CLabs</);assert.doesNotMatch(html,/REVIEWED REPORT|rp-status|private-reviewer@example.com|rp-footer/);assert.match(html,/rp-signature-line/);
 const signed=renderLabReport({...o,signature:'data:image/png;base64,AA=='},{name:'Test patient',id:'P1'});assert.match(signed,/alt="Reviewer signature"/);assert.doesNotMatch(signed,/rp-signature-line/);
});

test('reports and email subjects display sequential patient and accession numbers',()=>{const o={...order,sequenceNumber:12},p={id:'P-UUID',sequenceNumber:3,name:'Test'};const d=prepareResultEmail(o,p,'a@example.com');assert.match(d.html,/<small>Patient ID<\/small><div>3<\/div>/);assert.match(d.html,/<small>Accession<\/small><div>12<\/div>/);assert.equal(d.accession,12);assert.match(d.subject,/report 12$/);assert.doesNotMatch(d.html,/P-UUID/);});
