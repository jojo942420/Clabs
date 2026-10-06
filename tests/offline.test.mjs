import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../dist/server/index.js';
import { mergeWorkspace, changesReviewedResult, resolveWorkspaceConflicts } from '../web/offline-merge.js';

const state = () => ({ patients: [], orders: [], qc: [], analyzers: [], activity: [], customTests: [], testConfig: {}, prices: [], sales: [], ultrasoundReports: [] });

test('independent offline patient and remote order changes are combined', () => {
  const base = state();
  base.patients.push({ id: 'P-1', name: 'Original' });
  const local = structuredClone(base);
  local.patients.push({ id: 'P-2', name: 'Locally registered' });
  const remote = structuredClone(base);
  remote.orders.push({ id: 'O-1', patient: 'P-1' });
  const merged = mergeWorkspace(base, local, remote);
  assert.deepEqual(merged.conflicts, []);
  assert.equal(merged.data.patients.length, 2);
  assert.equal(merged.data.orders.length, 1);
});

test('concurrent changes to the same patient are preserved as conflicts', () => {
  const base = state();
  base.patients.push({ id: 'P-1', name: 'Original' });
  const local = structuredClone(base), remote = structuredClone(base);
  local.patients[0].name = 'Offline edit';
  remote.patients[0].name = 'Other staff edit';
  const merged = mergeWorkspace(base, local, remote);
  assert.deepEqual(merged.conflicts, ['patients: P-1']);
  assert.equal(merged.data.patients[0].name, 'Other staff edit');
});

test('reviewed result changes require an online release', () => {
  const base = state();
  base.orders.push({ id: 'O-1', reviewed: false });
  const local = structuredClone(base);
  local.orders[0].reviewed = true;
  assert.equal(changesReviewedResult(base, local), true);
});

test('the server serves an offline shell without caching patient API responses', async () => {
  const script = await worker.fetch(new Request('https://example.com/sw.js'), {});
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type'), /javascript/);
  const text = await script.text();
  assert.match(text, /mode !== 'navigate'/);
  const page = await worker.fetch(new Request('https://example.com/'), {});
  assert.match(await page.text(), /knox-encrypted-offline-v1/);
});

test('conflict recovery requires an explicit choice and keeps independent edits',()=>{
 const base=state();base.patients=[{id:'P1',name:'Before'}];
 const local=structuredClone(base),remote=structuredClone(base);local.patients[0].name='Local';local.patients.push({id:'P2',name:'Independent'});remote.patients[0].name='Shared';
 assert.throws(()=>resolveWorkspaceConflicts(base,local,remote,{}),/Choose a version/);
 assert.equal(resolveWorkspaceConflicts(base,local,remote,{'patients: P1':'local'}).patients.find(p=>p.id==='P1').name,'Local');
 const result=resolveWorkspaceConflicts(base,local,remote,{'patients: P1':'shared'});assert.equal(result.patients.find(p=>p.id==='P1').name,'Shared');assert.equal(result.patients.find(p=>p.id==='P2').name,'Independent');
});
