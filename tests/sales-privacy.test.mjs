import test from 'node:test';
import assert from 'node:assert/strict';
import {canViewSales} from '../worker/permissions.js';
import {visibleFinancialState,protectSalesWrites} from '../worker/sales-privacy.js';
import {recordSummary} from '../worker/record-state.js';
const finance={role:'reception',position:'Finance officer',permissions:['finance']};
const state={data:{orders:[{id:'O1',patient:'P1'},{id:'O2',patient:'P2'}],sales:[{id:'S1',orderId:'O1',total:100},{id:'S2',orderId:'O2',total:200}],activity:[{text:'Sale recorded: 100'},{text:'Patient registered'}]},scope:{sales:['S1','S2']},pageIds:{sales:['S1','S2']},pagination:{sales:'S2'}};
test('only CEO and administrator accounts can access revenue history',()=>{
 for(const user of [{role:'admin'},{role:'ceo'},{role:'viewer',position:'Chief Executive Officer'},{role:'viewer',position:'CEO'}])assert(canViewSales(user));
 for(const user of [finance,{role:'scientist'},{role:'viewer',permissions:['finance']},{role:'viewer',position:'Deputy CEO'}])assert.equal(canViewSales(user),false);
 const hidden=visibleFinancialState(finance,state);assert.deepEqual(hidden.data.sales,[]);assert.deepEqual(hidden.scope.sales,[]);assert.equal(hidden.pagination.sales,null);assert.deepEqual(hidden.data.activity,[{text:'Patient registered'}]);assert.equal(state.data.sales.length,2);
 assert.equal(visibleFinancialState({role:'ceo'},state),state);
});
test('individual receipt access never includes unrelated sales and historical writes are blocked',()=>{
 assert.deepEqual(visibleFinancialState(finance,state,'O1').data.sales,[state.data.sales[0]]);
 assert.deepEqual(visibleFinancialState(finance,state,'missing').data.sales,[]);
 assert.throws(()=>protectSalesWrites(finance,state.data.sales,[{...state.data.sales[0],total:1}]),e=>e.status===403);
 protectSalesWrites(finance,state.data.sales,[...state.data.sales,{id:'NEW',total:50}]);
});
test('nonexecutive summary queries never calculate or return sales totals or counts',async()=>{
 const queries=[],pg={sql:{query:async q=>{queries.push(q);return [{collection:'patients',count:2},{collection:'sales',count:9}]}}};
 const summary=await recordSummary(pg,false);assert.deepEqual(summary,{counts:{patients:2}});assert.equal(queries.length,1);assert.doesNotMatch(queries[0],/sum\(/);
});
