import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {PERMISSIONS,can,permissionsFor,isFinanceStaff,canViewSales} from '../worker/permissions.js';
const code=fs.readFileSync(new URL('../web/permissions.js',import.meta.url),'utf8');
const finance={role:'reception',position:'Finance officer',permissions:['finance','orders','specimens','results']};
function harness(user=finance){
 const buttons=['receive','resultForm','showReport','navTo'].map(call=>({call,disabled:false,getAttribute:()=>call+'()',removeAttribute(){this.removed=true}}));
 const amounts={},status={textContent:''},host={querySelector(selector){if(selector==='[data-finance-summary-status]')return status;return amounts[selector]??=( {textContent:''})}};
 const context=vm.createContext({currentUser:user,page:'Overview',can,permissionsFor,isFinanceStaff,canViewSales,PERMISSIONS,db:{sales:[],activity:[],orders:[]},financePage(){},exportSales(){},window:{},render(){},reloadShared(){},document:{querySelectorAll:selector=>selector==='#app button[onclick]'?buttons:[],getElementById:()=>host},btn:(label,action)=>'<button onclick="'+action+'">'+label+'</button>',money:n=>'GH₵ '+n});
 new vm.Script(code).runInContext(context);return {context,buttons,amounts,status};
}
test('home order actions are inaccessible to finance staff and available to administrators',()=>{
 const h=harness();vm.runInContext('render()',h.context);
 assert(h.buttons.slice(0,3).every(b=>b.disabled&&b.removed));assert.equal(h.buttons[3].disabled,false);
 const admin=harness({role:'admin'});vm.runInContext('render()',admin.context);assert(admin.buttons.every(b=>!b.disabled&&!b.removed));
});
test('finance quick view is permission-scoped and updates all four cloud totals',()=>{
 const h=harness({role:'admin'});const html=vm.runInContext('financeQuickView()',h.context);assert.match(html,/Finance at a glance/);assert.match(html,/View finance/);
 vm.runInContext("refreshFinanceQuickView({week:10,month:20,year:30,pending:40},'All saved sales')",h.context);
 assert.deepEqual(Object.values(h.amounts).map(x=>x.textContent),['GH₵ 10','GH₵ 20','GH₵ 30','GH₵ 40']);assert.equal(h.status.textContent,'All saved sales');
 assert.equal(vm.runInContext('financeQuickView()',harness({role:'scientist'}).context),'');assert.equal(vm.runInContext('financeQuickView()',harness(finance).context),'');assert.match(vm.runInContext('financeQuickView()',harness({role:'ceo'}).context),/Finance at a glance/);
});
test('patient search keeps internal patient links while displaying sequential numbers',async()=>{
 const source=fs.readFileSync(new URL('../web/records.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('async function searchOrderPatients('),source.indexOf("for(const name of ['orderForm'"));
 const select={value:'P-UUID',innerHTML:''},db={patients:[]};
 const context=vm.createContext({navigator:{onLine:true},URLSearchParams,structuredClone,rawRecordApi:async()=>({data:{patients:[{id:'P-UUID',sequenceNumber:7,name:'Test patient'}]},pageIds:{patients:['P-UUID']}}),document:{querySelector:()=>select},esc:String,displayNumber:p=>p.sequenceNumber,db,recordServerBase:{patients:[]},offlineBase:{patients:[]},offlineWorking:{patients:[]},notify(){}});
 new vm.Script(fn).runInContext(context);await vm.runInContext("searchOrderPatients('7')",context);
 assert.match(select.innerHTML,/value="P-UUID"/);assert.match(select.innerHTML,/Test patient · 7/);assert.equal(db.patients[0].id,'P-UUID');
});
test('late summary responses cannot update a different signed-in session',async()=>{
 const source=fs.readFileSync(new URL('../web/records.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('async function updateCloudTotals('),source.indexOf('const recordsNav='));
 let resolve;const updates=[];
 const context=vm.createContext({page:'Overview',workspaceSession:1,currentUser:finance,recordTotals:null,api:()=>new Promise(r=>resolve=r),refreshFinanceQuickView:(...args)=>updates.push(args),document:{querySelectorAll:()=>[]}});
 new vm.Script(fn).runInContext(context);const pending=vm.runInContext('updateCloudTotals()',context);
 context.workspaceSession=2;resolve({counts:{},finance:{week:100}});await pending;
 assert.equal(updates.length,0);assert.equal(context.recordTotals,null);
});
