import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authorizeChanges,can,isFinanceStaff} from '../worker/permissions.js';
const base=()=>({patients:[{id:'P1'}],orders:[{id:'O1',patient:'P1',reviewed:false,received:true}],qc:[],sales:[],prices:[],customTests:[],testConfig:{},analyzers:[],ultrasoundReports:[]});
const user=(...permissions)=>({role:'viewer',permissions});
test('draft entry does not confer release rights',()=>{const b=base(),a=structuredClone(b);a.orders[0].result='5';authorizeChanges(user('results'),b,a);a.orders[0].reviewed=true;assert.throws(()=>authorizeChanges(user('results'),b,a),/Validate/);authorizeChanges(user('results','review'),b,a)});
test('reviewed records require amendment permission and deletion is restricted',()=>{const b=base();b.orders[0].reviewed=true;const a=structuredClone(b);a.orders[0].result='6';assert.throws(()=>authorizeChanges(user('results','review'),b,a),/Amend/);authorizeChanges(user('results','review','amend'),b,a);a.orders=[];assert.throws(()=>authorizeChanges(user('results'),b,a),/Delete/)});
test('specimen receiving and catalogue edits have separate permissions',()=>{const b=base(),a=structuredClone(b);a.orders[0].received=false;assert.throws(()=>authorizeChanges(user('orders'),b,a),/specimens/);authorizeChanges(user('specimens'),b,a);a.testConfig={LFT:{fields:[]}};assert.throws(()=>authorizeChanges(user('specimens'),b,a),/templates/)});
test('finance assignments cannot perform laboratory order actions, while receipts remain allowed',()=>{
 const finance={role:'reception',position:'Finance officer',permissions:['finance','orders','specimens','results','review','amend','importResults']};
 assert(isFinanceStaff(finance));assert(can(finance,'finance'));
 for(const key of ['orders','specimens','results','review','amend','importResults'])assert.equal(can(finance,key),false);
 const b=base();for(const change of [o=>o.received=false,o=>o.result='5',o=>o.clinician='changed']){const a=structuredClone(b);change(a.orders[0]);assert.throws(()=>authorizeChanges(finance,b,a),/Permission required/)}
 const sale=structuredClone(b);sale.sales.push({id:'S1',patient:'P1',total:20});authorizeChanges(finance,b,sale);
 const removed=structuredClone(b);removed.orders=[];assert.throws(()=>authorizeChanges({...finance,permissions:['finance','delete']},b,removed),/Permission required/);
 assert(isFinanceStaff({role:'viewer',permissions:['finance']}));
 assert.equal(isFinanceStaff({role:'reception',position:'Receptionist'}),false);
 assert(can({role:'reception',position:'Receptionist'},'specimens'));
 assert.equal(isFinanceStaff({role:'admin',position:'Finance manager'}),false);assert(can({role:'admin',position:'Finance manager'},'results'));
});
