import test from 'node:test';
import assert from 'node:assert/strict';
import {patientAge} from '../shared/patient-age.js';
import {renderLabReport} from '../shared/lab-report.js';
import {prepareResultEmail} from '../worker/result-email.js';

test('age respects birthdays, infant units and valid calendar dates in GMT',()=>{
 assert.equal(patientAge('1995-10-04','2026-10-03T23:59:00Z'),'30 years');
 assert.equal(patientAge('1995-10-04','2026-10-04T00:00:00Z'),'31 years');
 assert.equal(patientAge('2026-09-03','2026-10-03'),'1 month');
 assert.equal(patientAge('2025-09-03','2026-10-03'),'13 months');
 assert.equal(patientAge('2026-10-02','2026-10-03'),'1 day');
 assert.equal(patientAge('2026-10-03','2026-10-03'),'0 days');
 assert.equal(patientAge('2024-02-29','2026-03-01'),'2 years');
 for(const dob of ['',undefined,'2025-02-29','2026-13-01','2027-01-01','<script>'])assert.equal(patientAge(dob,'2026-10-03'),'Not recorded');
});
test('printed and emailed reports show age at collection, without disclosing DOB',()=>{
 const patient={id:'P1',dob:'1995-10-04',name:'Test'},order={id:'O1',test:'Test',reviewed:true,created:'2026-10-05',collected:'2026-10-03T14:00',resultAt:'2026-10-06'};
 const before=JSON.stringify(patient),html=renderLabReport(order,patient);
 assert.match(html,/<small>Age<\/small><div>30 years<\/div>/);
 assert.doesNotMatch(html,/Date of birth|1995-10-04/);
 assert.equal(prepareResultEmail(order,patient,'a@example.com').html.includes('30 years'),true);
 assert.equal(JSON.stringify(patient),before);
});
