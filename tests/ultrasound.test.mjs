import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeChanges} from '../worker/permissions.js';
import {validateUltrasound,prepareUltrasoundChanges} from '../worker/ultrasound.js';
import {visibleUltrasoundState} from '../worker/ultrasound-privacy.js';
import {renderUltrasoundReport} from '../shared/ultrasound-report.js';
import {changesReviewedResult} from '../web/offline-merge.js';
const report=()=>({id:'U1',patient:'P1',test:'Abdominal ultrasound',department:'Ultrasound',examAt:'2025-10-01T10:00:00Z',created:'2025-10-01T09:00:00Z',operator:'Sonographer',technique:'Transabdominal',indication:'Test indication',impression:'Test impression',template:{fields:[{name:'Finding',type:'narrative'}]},resultRows:[{name:'Finding',value:'Test finding',state:'Result'}],reviewed:false});
const data=()=>({patients:[{id:'P1',name:'Test patient',dob:'1990-01-01',sex:'Female'}],orders:[],qc:[],sales:[],prices:[],customTests:[],testConfig:{},analyzers:[],ultrasoundReports:[]});
const user=(...permissions)=>({role:'viewer',permissions});
test('ultrasound permissions independently govern drafts, approval, amendments and deletion',()=>{
 const before=data(),after=data();after.ultrasoundReports=[report()];
 assert.throws(()=>authorizeChanges(user('results','review'),before,after),/ultrasound/);
 authorizeChanges(user('ultrasoundView','ultrasoundEnter'),before,after);
 const reviewed=structuredClone(after);reviewed.ultrasoundReports[0].reviewed=true;reviewed.ultrasoundReports[0].identityVerified=true;
 assert.throws(()=>authorizeChanges(user('ultrasoundView','ultrasoundEnter'),after,reviewed),/Approve/);
 authorizeChanges(user('ultrasoundView','ultrasoundReview'),after,reviewed);
 const amended=structuredClone(reviewed);amended.ultrasoundReports[0].impression='Correction';
 assert.throws(()=>authorizeChanges(user('ultrasoundView','ultrasoundEnter','ultrasoundReview'),reviewed,amended),/Amend/);
 authorizeChanges(user('ultrasoundView','ultrasoundEnter','ultrasoundReview','ultrasoundAmend'),reviewed,amended);
 assert.throws(()=>authorizeChanges({role:'admin'},reviewed,data()),/amended/);
});
test('finalisation validates completeness and stamps the authenticated approver',()=>{
 const draft=report(),d=data();d.ultrasoundReports=[draft];validateUltrasound(draft,d);
 const next=structuredClone(d);Object.assign(next.ultrasoundReports[0],{reviewed:true,identityVerified:true,reviewer:'Forged',reviewerEmail:'forged@example.com'});
 prepareUltrasoundChanges({name:'Authorized approver',email:'approver@example.com'},d,next);
 assert.equal(next.ultrasoundReports[0].reviewer,'Authorized approver');assert.equal(next.ultrasoundReports[0].reviewerEmail,'approver@example.com');
 for(const mutate of [r=>r.impression='',r=>r.resultRows[0].value='',r=>r.identityVerified=false,r=>r.examAt='invalid']){const r=structuredClone(next.ultrasoundReports[0]);mutate(r);assert.throws(()=>validateUltrasound(r,next));}
 const amend=structuredClone(next);amend.ultrasoundReports[0].impression='Updated';assert.throws(()=>prepareUltrasoundChanges({name:'Approver'},next,amend),/reason/);
 amend.ultrasoundReports[0].amendmentReason='Corrected transcription';prepareUltrasoundChanges({name:'Approver'},next,amend);assert.equal(amend.ultrasoundReports[0].amendments[0].previous.impression,'Test impression');
 assert(changesReviewedResult(next,amend));
});
test('ultrasound records are private and printable reports escape clinical text',()=>{
 const d=data();d.ultrasoundReports=[report()];const s={data:d,scope:{ultrasoundReports:['U1']},pagination:{ultrasoundReports:'U1'}};
 assert.deepEqual(visibleUltrasoundState({role:'scientist'},s).data.ultrasoundReports,[]);
 assert.equal(visibleUltrasoundState(user('ultrasoundView'),s),s);
 const r={...report(),reviewed:true,sequenceNumber:2,reviewer:'Approver',resultAt:'2025-10-01',impression:'<script>unsafe</script>'};
 const html=renderUltrasoundReport(r,d.patients[0]);assert.match(html,/ULTRASOUND REPORT/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/1990-01-01|approver@example.com|<script>/);assert.match(html,/35 years/);assert.match(html,/Scan number/);
});
