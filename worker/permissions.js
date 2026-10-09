export const PERMISSIONS = {
 monthlyReports:'View monthly patient results and test summaries',
 stockView:'View stock records and usage', stockManage:'Configure stock items, test usage and restocking',
 ultrasoundView:'View ultrasound workspace and reports', ultrasoundEnter:'Create and edit ultrasound drafts', ultrasoundReview:'Approve and sign ultrasound reports', ultrasoundAmend:'Amend final ultrasound reports',
 attendance:'Record and view staff attendance',
 emailResults:'Prepare result emails', patients:'Register and edit patients', orders:'Create and edit orders', specimens:'Receive specimens',
 results:'Enter draft results', review:'Validate and release results', qc:'Record quality control',
 finance:'Record sales and issue receipts', catalogue:'Edit tests, templates and prices',
 analyzers:'Configure analyzers', importResults:'Import analyzer results', audit:'View audit log',
 amend:'Amend released results', delete:'Delete records'
};
export const DEFAULT_PERMISSIONS={admin:Object.keys(PERMISSIONS),ceo:['finance','stockView'],scientist:['monthlyReports','stockView','patients','orders','specimens','results','review','qc','importResults'],reception:['patients','orders','specimens','finance'],viewer:[]};
export function canViewSales(user){return !!user&&(user.role==='admin'||user.role==='ceo'||/^(ceo|chief executive officer)$/i.test((user.position||'').trim()))}
const labOrderPermissions=['orders','specimens','results','review','amend','importResults','ultrasoundEnter','ultrasoundReview','ultrasoundAmend'];
export function isFinanceStaff(user){
 if(!user||canViewSales(user))return false;
 const assigned=Array.isArray(user.permissions)?user.permissions:DEFAULT_PERMISSIONS[user.role]||[];
 return /\b(finance|financial|accounts?|accountant|cashier|billing)\b/i.test(user.position||'')||(assigned.includes('finance')&&!assigned.some(key=>labOrderPermissions.includes(key)));
}
export function permissionsFor(user){if(user.role==='admin')return Object.keys(PERMISSIONS);const assigned=Array.isArray(user.permissions)?user.permissions:DEFAULT_PERMISSIONS[user.role]||[];return isFinanceStaff(user)?assigned.filter(key=>!labOrderPermissions.includes(key)):assigned}
export function can(user,key){return permissionsFor(user).includes(key)}
export function requirePermission(user,key){if(!can(user,key))throw Object.assign(new Error('Permission required: '+PERMISSIONS[key]),{status:403})}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function authorizeChanges(user,before,after){
 authorizeUltrasoundChanges(user,before.ultrasoundReports||[],after.ultrasoundReports||[]);
 if(user.role==='admin')return;
 if(isFinanceStaff(user)&&!equal(before.orders,after.orders))requirePermission(user,'orders');
 const check=(key,permission)=>{if(!equal(before[key],after[key]))requirePermission(user,permission)};
 for(const [key,permission]of Object.entries({patients:'patients',qc:'qc',sales:'finance',prices:'catalogue',customTests:'catalogue',testConfig:'catalogue',analyzers:'analyzers'}))check(key,permission);
 for(const key of ['patients','orders','qc','sales','customTests','analyzers'])if(before[key].some(x=>!after[key].some(y=>x.id===y.id)))requirePermission(user,'delete');
 if(before.orders.some(o=>o.reviewed&&!after.orders.some(n=>n.id===o.id)))requirePermission(user,'amend');
 const orderFields=['patient','patientId','priority','clinician','collected','requestNote','testId','test','department','specimen','template','created','requestId','operator'];
 for(const o of after.orders){const old=before.orders.find(x=>x.id===o.id);if(equal(old,o))continue;
 if(old?.reviewed)requirePermission(user,'amend');
 if(!old)requirePermission(user,'orders');
 for(const key of new Set([...Object.keys(old||{}),...Object.keys(o)])){
 if(equal(old?.[key],o[key])||key==='id'||key==='changeReason')continue;
 if(key==='reviewed'){if(o.reviewed)requirePermission(user,'review');continue;}
 if(key==='received'){if(o.received||old)requirePermission(user,'specimens');continue;}
 requirePermission(user,orderFields.includes(key)?'orders':'results');
 }
 if(o.reviewed)requirePermission(user,'review');
 }
 if(permissionsFor(user).length===0)throw Object.assign(new Error('This account has read-only access'),{status:403});
}

export function authorizeUltrasoundChanges(user,before,after){
 const content=r=>{const out={...r};for(const key of ['reviewed','reviewer','reviewerEmail','resultAt','identityVerified','signature','amendments','amendmentReason'])delete out[key];return out};
 for(const old of before)if(!after.some(r=>r.id===old.id)){requirePermission(user,'ultrasoundView');requirePermission(user,'ultrasoundEnter');requirePermission(user,'delete');if(old.reviewed)throw Object.assign(new Error('Final ultrasound reports must be amended, not deleted'),{status:403});}
 for(const r of after){const old=before.find(o=>o.id===r.id);if(equal(old,r))continue;requirePermission(user,'ultrasoundView');if(old?.reviewed)requirePermission(user,'ultrasoundAmend');if(!old||!equal(content(old),content(r)))requirePermission(user,'ultrasoundEnter');if(r.reviewed)requirePermission(user,'ultrasoundReview');else if(old?.reviewed)requirePermission(user,'ultrasoundAmend');else requirePermission(user,'ultrasoundEnter');}
}
