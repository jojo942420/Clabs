import {canViewSales} from './permissions.js';
const fail=message=>{throw Object.assign(new Error(message),{status:403})};
export function protectSalesWrites(user,before,after){
 if(canViewSales(user))return;
 const old=new Map(before.map(s=>[s.id,s]));
 for(const sale of after)if(old.has(sale.id)&&JSON.stringify(old.get(sale.id))!==JSON.stringify(sale))fail('Only CEO and administrator accounts may change historical sales records');
}
export function visibleFinancialState(user,state,receiptOrderId=null){
 if(canViewSales(user))return state;
 const out=structuredClone(state);
 const order=receiptOrderId&&out.data.orders.find(o=>o.id===receiptOrderId);
 const ids=new Set(order?out.data.orders.filter(o=>o.patient===order.patient&&(order.requestId?o.requestId===order.requestId:o.id===order.id)).map(o=>o.id):[]);
 out.data.sales=receiptOrderId?out.data.sales.filter(s=>ids.has(s.orderId)):[];
 out.data.activity=(out.data.activity||[]).filter(a=>!/(sale|revenue|receipt|invoice|payment|finance)/i.test(a.text||''));
 if(out.scope)out.scope.sales=out.data.sales.map(s=>s.id);
 if(out.pageIds)out.pageIds.sales=out.data.sales.map(s=>s.id);
 if(out.pagination)out.pagination.sales=null;
 return out;
}
