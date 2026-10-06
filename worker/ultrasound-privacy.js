import {can} from './permissions.js';
export function visibleUltrasoundState(user,state){
 if(can(user,'ultrasoundView'))return state;
 const out=structuredClone(state);out.data.ultrasoundReports=[];
 out.data.activity=(out.data.activity||[]).filter(a=>!/ultrasound/i.test(a.text||''));
 if(out.scope)out.scope.ultrasoundReports=[];
 if(out.pageIds)out.pageIds.ultrasoundReports=[];
 if(out.pagination)out.pagination.ultrasoundReports=null;
 return out;
}
