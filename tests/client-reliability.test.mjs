import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import worker from '../dist/server/index.js';
import {requestJSON} from '../web/transport.js';

const response=data=>({ok:true,status:200,json:async()=>data});
test('a stalled response body times out instead of locking the workspace',async()=>{
 await assert.rejects(requestJSON('/api/state',{method:'PUT'},{timeoutMs:15,fetchImpl:async()=>({...response({}),json:()=>new Promise(()=>{})})}),e=>e.transportFailure===true&&/timed out/.test(e.message));
});
test('transient reads retry, saves never repeat without reconciliation',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;if(calls===1)throw new TypeError('offline');return response({revision:2})};
 assert.equal((await requestJSON('/api/state',{}, {fetchImpl})).revision,2);assert.equal(calls,2);
 calls=0;await assert.rejects(requestJSON('/api/state',{method:'PUT'},{fetchImpl}));assert.equal(calls,1);
});
test('sign-in and permission errors retain their status and do not retry',async()=>{
 let calls=0;await assert.rejects(requestJSON('/api/me',{}, {fetchImpl:async()=>{calls++;return {ok:false,status:401,json:async()=>({error:'Invalid username or password'})}}}),e=>e.status===401);assert.equal(calls,1);
});
test('an HTML gateway error is recoverable and does not surface a JSON parser crash',async()=>{
 await assert.rejects(requestJSON('/api/state',{method:'PUT'},{fetchImpl:async()=>({status:503,json:async()=>{throw new SyntaxError('Unexpected token <')}})}),e=>e.transportFailure&&/incomplete response/.test(e.message));
});
const blank=()=>({patients:[],orders:[],qc:[],analyzers:[],activity:[],customTests:[],testConfig:{},prices:[],sales:[],ultrasoundReports:[]});
function recordsHarness(){
 const pending=[],classes=new Set();const context=vm.createContext({URLSearchParams,structuredClone,console,workspaceSession:1,page:'Patients',query:'',unsaved:false,offlinePending:false,saving:false,offlineSyncing:false,navigator:{onLine:true},db:blank(),offlineBase:blank(),offlineWorking:blank(),serverRevision:0,notify:()=>{},render:()=>{},offlinePersist:async()=>{},document:{body:{classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)}},getElementById:()=>({open:false})},api:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))});
 const source=fs.readFileSync(new URL('../web/records.js',import.meta.url),'utf8').split('function recordPageControls()')[0];vm.runInContext(source,context);
 return {context,pending,classes,run:code=>vm.runInContext(code,context)};
}
test('rapid navigation commits only the most recently requested record page',async()=>{
 const h=recordsHarness();const a=h.run("loadRecordPage({collection:'patients',query:'Old'})"),b=h.run("loadRecordPage({collection:'patients',query:'New'})");
 const data=blank();data.patients=[{id:'NEW'}];h.pending[1].resolve({data,revision:2,storageVersion:3});await b;
 h.pending[0].resolve({data:blank(),revision:1,storageVersion:3});await a;
 assert.equal(h.run('db.patients[0].id'),'NEW');assert.equal(h.run('recordServerBase.patients[0].id'),'NEW');assert.equal(h.run('recordView.query'),'New');assert.equal(h.run('query'),'New');assert.equal(h.classes.size,0);
});
test('opening a form while records load preserves the current save baseline',async()=>{
 const h=recordsHarness();const a=h.run("loadRecordPage({collection:'patients'})");h.context.document.getElementById=()=>({open:true});
 h.pending[0].resolve({data:blank(),revision:2,storageVersion:3});await a;assert.equal(h.run('recordServerBase'),null);assert.equal(h.run('serverRevision'),0);assert.equal(h.classes.size,0);
});
test('late loads cannot reopen records after sign-out',async()=>{
 const h=recordsHarness();const a=h.run("loadRecordPage({collection:'patients'})");h.run('workspaceSession++');const data=blank();data.patients=[{id:'OLDUSER'}];h.pending[0].resolve({data,revision:2,storageVersion:3});await a;assert.equal(h.run('db.patients.length'),0);
});
test('the built UI scripts compile together, including every extension',async()=>{
 const html=await (await worker.fetch(new Request('https://example.test/'),{})).text();
 const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(x=>x[1]);new vm.Script(scripts.join('\n'));assert(scripts.length>=4);
});

test('simultaneous database reads share initialization and failed setup can retry',async()=>{
 const {ensureRecords}=await import('../worker/record-state.js');globalThis.RECORD_SCHEMA_SQL='SELECT 1';globalThis.NUMBER_SCHEMA_SQL='SELECT 1';let calls=0;
 const pg={sql:{query:async()=>[{revision:1}],transaction:async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,5))}}};
 await Promise.all(Array.from({length:20},()=>ensureRecords(pg)));assert.equal(calls,2);
 let failures=0;const retry={sql:{query:async()=>[{revision:1}],transaction:async()=>{if(!failures++)throw new Error('temporary failure')}}};
 await assert.rejects(ensureRecords(retry),/temporary failure/);await ensureRecords(retry);assert.equal(failures,3);
});

test('closing a modal retires its native layer and Escape follows the same cleanup',()=>{
 const html=fs.readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
 const closeCode=html.slice(html.indexOf('function closeModal(){'),html.indexOf('function attachmentField(',html.indexOf('function closeModal(){')));
 const bindCode=html.slice(html.indexOf('function bindModalLifecycle('),html.indexOf('bindModalLifecycle(document.'));
 let active,retired=0,focused=0;
 function dialog(){return {open:true,isConnected:true,listeners:{},classList:{remove(){}},close(){this.open=false},cloneNode(){return dialog()},removeAttribute(){this.open=false},addEventListener(name,fn){this.listeners[name]=fn},replaceWith(next){assert.equal(this.open,false);this.isConnected=false;active=next;retired++}}}
 active=dialog();const context=vm.createContext({document:{getElementById:()=>active},modalOpener:{isConnected:true,focus(){focused++}}});
 new vm.Script(bindCode+'\n'+closeCode).runInContext(context);vm.runInContext('closeModal()',context);
 assert.equal(retired,1);assert.equal(focused,1);assert.equal(active.open,false);assert.match(active.innerHTML,/<form id="form"><\/form>/);
 for(let i=0;i<50;i++){const old=active;active.open=true;let prevented=false;active.listeners.cancel({preventDefault(){prevented=true}});assert(prevented);assert.equal(old.isConnected,false);assert.equal(active.open,false)}
 assert.equal(retired,51);
});
