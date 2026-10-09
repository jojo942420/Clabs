// Only the loaded page and its referenced records live in the browser.
let recordPatientPageIds=null;
let recordNavigationSuppressed=false,recordLoadSequence=0;
let recordServerBase=null,recordPagination={},recordStorageVersion=0,recordView={},recordTotals=null,recordLoading=false;
const collectionForPage={Electrocardiogram:'orders',Ultrasound:'ultrasoundReports',Patients:'patients',Orders:'orders',Results:'orders',Reports:'orders','Quality control':'qc',Finance:'sales','Manage records':'patients'};
const rawRecordApi=api;
api=async function(path,method='GET',payload){
 if(path==='/api/state'&&method==='GET'&&recordStorageVersion===3)path='/api/state?'+new URLSearchParams(recordView);
 if(path==='/api/state'&&method==='PUT'&&recordStorageVersion===3){if(!recordServerBase)throw new Error('Reload records before saving.');payload={revision:payload.revision,...recordDelta(recordServerBase,payload.data),changeReasons:payload.changeReasons||{}}}
 const result=await rawRecordApi(path,method,payload);
 acceptRecordState(result);
 return result;
};
function acceptRecordState(result){if(result?.storageVersion===3&&result.data){recordStorageVersion=3;if(result.pageIds)recordPatientPageIds=result.pageIds.patients;else if(recordPatientPageIds&&recordServerBase)recordPatientPageIds=[...new Set([...recordPatientPageIds,...result.data.patients.filter(p=>!recordServerBase.patients.some(old=>old.id===p.id)).map(p=>p.id)])];recordServerBase=structuredClone(result.data);recordPagination=result.pagination||recordPagination;}}
async function loadRecordPage({after='',query:cloudQuery='',patientId='',requestId='',collection=collectionForPage[page],status=page==='Electrocardiogram'?'ecg':''}={}){
 if(!collection||(collection==='sales'&&!canViewSales(currentUser)))return;
 if(unsaved||offlinePending||saving||offlineSyncing)return notify('Save and synchronize your changes before changing pages.');
 if(document.getElementById('modal').open)return notify('Close the current form before loading another page.');
 if(!navigator.onLine)return notify('Search and more pages need a connection. Previously loaded records remain available offline.');
 const sequence=++recordLoadSequence,session=workspaceSession,targetPage=page,nextView={collection,after,query:cloudQuery,patientId,requestId,status};
 recordLoading=true;document.body.classList.add('loading-records');
 try{
  const state=await rawRecordApi('/api/state?'+new URLSearchParams(nextView));
  if(sequence!==recordLoadSequence||session!==workspaceSession||targetPage!==page)return;
  if(unsaved||offlinePending||saving||document.getElementById('modal').open){notify('Page load paused to preserve your open form or changes.');return}
  recordView=nextView;query=cloudQuery;acceptRecordState(state);db=state.data;serverRevision=state.revision;
  offlineBase=structuredClone(db);offlineWorking=structuredClone(db);render();
  await offlinePersist().catch(()=>{});
 }catch(error){if(sequence===recordLoadSequence&&!error.sessionChanged)notify(error.message)}
 finally{if(sequence===recordLoadSequence){recordLoading=false;document.body.classList.remove('loading-records')}}
}

function recordPageControls(){
 if(recordStorageVersion!==3)return;const collection=collectionForPage[page];if(!collection||(collection==='sales'&&!canViewSales(currentUser)))return;
 const host=document.getElementById('app');if(host.querySelector('[data-record-pages]'))return;
 const next=recordPagination[collection];
 host.insertAdjacentHTML('afterbegin','<section data-record-pages class="card padded" style="margin-bottom:16px"><b>Cloud records · paginated view</b><span class="record-load-indicator" role="status"> Updating…</span><p class="help">50 records per page. Search by name prefix or exact ID. Offline access includes loaded records only.</p><form onsubmit="event.preventDefault();loadRecordPage({query:this.elements.cloudQuery.value.trim()})" style="display:flex;gap:8px;flex-wrap:wrap"><input name="cloudQuery" aria-label="Search all cloud records" placeholder="Search all records" value="'+esc(recordView.query||'')+'" style="flex:1;min-width:160px"><button class="btn primary" type="submit">Search database</button></form><div style="margin-top:12px">'+btn('First page','loadRecordPage()')+' '+(next?btn('Next 50',"nextRecordPage()"):'<span class="help">End of results</span>')+'</div></section>');
}
function nextRecordPage(){const k=collectionForPage[page];if(recordPagination[k])loadRecordPage({...recordView,collection:k,after:recordPagination[k]})}
const recordsRender=render;
render=function(){recordsRender();if(!currentUser)return;recordPageControls();if(recordStorageVersion===3)document.querySelectorAll('#app button[onclick="backup()"]').forEach(b=>b.textContent='Export loaded records');if(recordStorageVersion===3&&['Overview','Finance'].includes(page))void updateCloudTotals()};
async function updateCloudTotals(){const currentPage=page,session=workspaceSession;try{const totals=await api(page==='Overview'?'/api/summary?countsOnly=1':'/api/summary');if(page!==currentPage||session!==workspaceSession||!currentUser)return;recordTotals=totals;if(page==='Overview'){refreshFinanceQuickView(totals.finance,'All saved sales · paid revenue and pending payments · GMT');const cards=document.querySelectorAll('#app .stat');if(cards[0]){cards[0].querySelector('strong').textContent=Number(totals.counts.patients||0).toLocaleString();cards[0].querySelector('small').textContent='All cloud patient records'}document.querySelectorAll('#app .stat small').forEach((el,i)=>{if(i)el.textContent='In the loaded order page'});document.querySelectorAll('#app .cardhead .subtitle').forEach(el=>el.textContent='Loaded records');}if(page==='Finance'&&canViewSales(currentUser)){const cards=document.querySelectorAll('#app .stat');['week','month','year','pending'].forEach((k,i)=>{if(cards[i]){cards[i].querySelector('strong').textContent=money(Number(totals.finance[k]||0));cards[i].querySelector('small').textContent=k==='pending'?'All pending cloud sales':'All paid cloud sales'}})}}catch(e){if(page!==currentPage||session!==workspaceSession||!currentUser)return;if(page==='Overview')refreshFinanceQuickView(null,'Totals unavailable — reconnect and reload to refresh.');document.querySelectorAll('#app .stat small').forEach(el=>el.textContent='Loaded page only — connect to refresh totals')}}
const recordsNav=navTo;
navTo=function(p){if(saving||offlineSyncing){notify('Please wait for the current save to finish.');return}if(unsaved||offlinePending){if(p!==page)notify('Showing cached records. Synchronize before loading another page.');recordsNav(p);return}recordLoadSequence++;recordLoading=false;document.body.classList.remove('loading-records');recordsNav(p);if(!recordNavigationSuppressed&&recordStorageVersion===3&&navigator.onLine&&collectionForPage[p]&&(p!=='Finance'||canViewSales(currentUser)))void loadRecordPage({collection:collectionForPage[p],status:p==='Electrocardiogram'?'ecg':p==='Reports'?'reviewed':p==='Results'?'received':''})};
// Patient selection in order and sale forms searches the full database without loading all patients.
async function searchOrderPatients(value){if(!navigator.onLine)return notify('Patient search requires a connection.');try{const response=await rawRecordApi('/api/state?'+new URLSearchParams({collection:'patients',query:value.trim()}));const select=document.querySelector('#form [name="patient"]');if(!select)return;const found=response.data.patients.filter(p=>!response.pageIds||response.pageIds.patients.includes(p.id));select.innerHTML=found.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+' · '+esc(displayNumber(p))+'</option>').join('');select.onchange=()=>{const p=response.data.patients.find(p=>p.id===select.value);if(p){for(const data of [db,recordServerBase,offlineBase,offlineWorking])if(data&&!data.patients.some(x=>x.id===p.id))data.patients.push(structuredClone(p))}};select.onchange();if(!found.length)notify('No patient matches. Refine the search.')}catch(e){notify(e.message)}}
for(const name of ['orderForm','saleForm']){const original=window[name];window[name]=function(...args){original.apply(this,args);if(recordStorageVersion===3&&document.getElementById('modal').open){const select=document.querySelector('#form [name="patient"]');if(select)select.closest('label').insertAdjacentHTML('beforebegin','<div class="full"><label>Search all patients<input id="cloudPatientSearch" placeholder="Name starts with or exact patient ID"></label><button type="button" class="btn" onclick="searchOrderPatients(document.getElementById(\'cloudPatientSearch\').value)">Find patient</button></div>')}}}
const recordsBackup=backup;
backup=function(){if(recordStorageVersion===3){download('CLabs-loaded-records-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({partialExport:true,description:'Loaded records only. Full database recovery uses Neon backups.',revision:serverRevision,data:db},null,2),'application/json');notify('Exported loaded records only. This is not a complete database backup.')}else recordsBackup()};
const recordsExportSales=exportSales;
exportSales=function(){if(recordStorageVersion===3)notify('CSV contains the loaded sales page only. Cloud totals cover all records.');return recordsExportSales()};

const paginatedReceipt=orderReceipt;
orderReceipt=async function(id){if(recordStorageVersion!==3)return paginatedReceipt(id);if(unsaved||offlinePending)return notify('Save and synchronize changes before opening a receipt.');if(!navigator.onLine)return notify('Reconnect to load the complete request and its receipts.');try{const s=await api('/api/receipt-context','POST',{orderId:id});db=s.data;serverRevision=s.revision;offlineBase=structuredClone(db);offlineWorking=structuredClone(db);await offlinePersist().catch(()=>{});return paginatedReceipt(id)}catch(e){notify(e.message)}};

const recordsShowReport=showReport;
showReport=function(id){recordNavigationSuppressed=true;try{return recordsShowReport(id)}finally{recordNavigationSuppressed=false}};

const recordsSignOut=manualSignOut;
manualSignOut=function(){recordLoadSequence++;recordLoading=false;recordPatientPageIds=null;recordServerBase=null;recordPagination={};recordStorageVersion=0;recordView={};recordTotals=null;saving=false;unsaved=false;document.body.classList.remove('saving','loading-records');recordsSignOut()};
