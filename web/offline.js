// Patient records never enter Cache Storage. IndexedDB holds only an encrypted snapshot.
const OFFLINE_DB = 'knox-encrypted-offline-v1';
let offlineKey = null;
let offlineSalt = null;
let offlineBase = null;
let offlineWorking = null;
let offlinePending = false;
let offlineMode = false;
let offlineSyncing = false;
let offlineConflict = [];
let offlineCacheLocked = false;
let lastTransportFailure = false;
let lastApiError = null;

function offlineClone(value) { return structuredClone(value); }
function offlineRequest(request) {
  return new Promise((resolve, reject) => {
    let settled=false;
    const timer=setTimeout(()=>{settled=true;reject(new Error('Offline storage did not respond. Online records remain available.'))},5000);
    request.onsuccess=()=>{clearTimeout(timer);if(settled){request.result?.close?.();return}settled=true;resolve(request.result)};
    request.onerror=()=>{clearTimeout(timer);settled=true;reject(request.error)};
    request.onblocked=()=>{clearTimeout(timer);settled=true;reject(new Error('Offline storage is locked by another tab. Close that tab and retry.'))};
  });
}
async function offlineStore() {
  const request = indexedDB.open(OFFLINE_DB, 1);
  request.onupgradeneeded = () => request.result.createObjectStore('sessions');
  return offlineRequest(request);
}
async function offlineRead(email) {
  const database = await offlineStore();
  try { return await offlineRequest(database.transaction('sessions').objectStore('sessions').get(email)); }
  finally { database.close(); }
}
async function offlineWrite(email, record) {
  const database = await offlineStore();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('sessions', 'readwrite');
      transaction.objectStore('sessions').put(record, email);
      const timer=setTimeout(()=>{try{transaction.abort()}catch{}reject(new Error('Offline storage timed out.'))},5000);
      transaction.oncomplete=()=>{clearTimeout(timer);resolve()};
      transaction.onerror=transaction.onabort=()=>{clearTimeout(timer);reject(transaction.error||new Error('Offline storage write failed.'))};
    });
  } finally { database.close(); }
}
async function offlineDerive(password, salt) {
  const secret = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, secret, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function offlineUnlock(email, password) {
  const session=workspaceSession;
  const record = await offlineRead(email);
  if (!record) return null;
  const salt = new Uint8Array(record.salt);
  const key = await offlineDerive(password, salt);
  const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(record.iv), additionalData: new TextEncoder().encode(email) }, key, record.ciphertext);
  if(session!==workspaceSession)throw Object.assign(new Error('Staff session changed.'),{sessionChanged:true});
  offlineKey = key;
  offlineSalt = salt;
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function offlinePersist() {
  const session=workspaceSession,email=manualUsername;
  if(!currentUser||!email)throw new Error('Sign in before caching records.');
  if (offlineCacheLocked) throw new Error('Existing offline changes need the original password before this device can cache new records.');
  if (!offlineKey) {
    const salt=crypto.getRandomValues(new Uint8Array(16)),key=await offlineDerive(manualPassword,salt);
    if(session!==workspaceSession)throw new Error('Staff session changed before caching records.');
    offlineSalt=salt;offlineKey=key;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = { user: currentUser, revision: serverRevision, base: offlineBase, working: offlineWorking, pending: offlinePending };
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(email) }, offlineKey, new TextEncoder().encode(JSON.stringify(payload)));
  if(session!==workspaceSession)throw new Error('Session changed before caching records.');
  await offlineWrite(email, { salt: [...offlineSalt], iv: [...iv], ciphertext, updatedAt: new Date().toISOString() });
}
function offlineStatus() {
  const status = document.getElementById('syncStatus');
  if (!status || !currentUser) return;
  if (offlineConflict.length) status.textContent = 'Sync needs review — conflicting records: ' + offlineConflict.join(', ') + '. Local changes are preserved on this device.';
  else if (offlineSyncing) status.textContent = 'Syncing encrypted offline changes…';
  else if (offlinePending) status.textContent = (offlineMode || !navigator.onLine ? 'Offline' : 'Waiting to sync') + ' — changes saved on this device, not yet shared';
  else if (offlineMode || !navigator.onLine) status.textContent = 'Offline — showing the last synchronized records; reviewed results require a connection';
  else status.textContent = unsaved ? 'Unsaved changes — save or export before closing' : 'Shared records saved · revision ' + serverRevision;
  let retry=document.getElementById('retryOfflineSync');
  if((offlinePending||offlineConflict.length)&&!retry){retry=document.createElement('button');retry.id='retryOfflineSync';retry.className='btn small';retry.textContent='Retry sync';retry.onclick=()=>{if(offlineSyncing)return;offlineConflict=[];void syncOfflineChanges()};status.after(retry)}
  if(retry)retry.hidden=!offlinePending&&!offlineConflict.length;
  let review=document.getElementById('reviewOfflineConflicts');
  if(offlineConflict.length&&!review){review=document.createElement('button');review.id='reviewOfflineConflicts';review.className='btn small';review.textContent='Review conflicts';review.onclick=()=>void reviewOfflineConflicts();status.after(review)}
  if(review)review.hidden=!offlineConflict.length;
}

const offlineOriginalApi = api;
api = async function(path, method = 'GET', data) {
  lastTransportFailure = false;
  lastApiError = null;
  try { return await offlineOriginalApi(path, method, data); }
  catch (error) {
    lastTransportFailure = error.transportFailure === true;
    lastApiError = error;
    throw error;
  }
};

startWorkspace = async function() {
  const email = manualUsername.trim().toLowerCase();
  const session=workspaceSession;
  if (!email || !manualPassword) { loginScreen('Enter your username and password.'); return; }
  let saved = null, unlockError = null, existing = null;
  try {
    existing = await offlineRead(email);
    if (existing) saved = await offlineUnlock(email, manualPassword);
  } catch (error) { unlockError = error; }
  try {
    const me = await api('/api/me');
    const latest = await api('/api/state');
    if(session!==workspaceSession)return;
    currentUser = me.user;
    if (saved?.pending && saved.user?.email === me.user.email) {
      offlineBase = saved.base;
      offlineWorking = saved.working;
      offlinePending = true;
      db = offlineClone(offlineWorking);
      serverRevision = saved.revision;
    } else {
      offlineCacheLocked=false;offlineConflict=[];
      db = latest.data;
      serverRevision = latest.revision;
      offlineBase = offlineClone(db);
      offlineWorking = offlineClone(db);
      offlinePending = false;
      if (existing && unlockError) offlineCacheLocked = true;
      else try { await offlinePersist(); } catch (error) { notify('Signed in online. This device could not cache records for offline use.'); }
    }
    if(session!==workspaceSession)return;
    offlineMode = false;
    unsaved = false;
    document.body.classList.remove('locked');
    document.getElementById('authGate').hidden = true;
    render();
    if (offlinePending) await syncOfflineChanges(latest);
    if (offlineCacheLocked) notify('Online access works, but offline records on this device need their original password.');
  } catch (error) {
    if(session!==workspaceSession||error.sessionChanged)return;
    if (error.transportFailure && saved?.user?.email === email && saved.base && saved.working) {
      currentUser = saved.user;
      db = offlineClone(saved.working);
      serverRevision = saved.revision;
      offlineBase = saved.base;
      offlineWorking = saved.working;
      offlinePending = !!saved.pending;
      offlineMode = true;
      unsaved = false;
      document.body.classList.remove('locked');
      document.getElementById('authGate').hidden = true;
      render();
      notify('Offline workspace unlocked. Changes sync when you reconnect.');
      return;
    }
    currentUser = null;
    loginScreen(error.transportFailure ? 'Offline access needs a prior online sign-in on this device with the same password.' : error.message);
  }
};

const offlineOriginalSave = save;
save = async function(message) {
  if (!currentUser) { notify('Sign in first.'); return false; }
  if (offlineSyncing || saving || (typeof recordLoading !== 'undefined' && recordLoading)) { notify('A save is already in progress.'); return false; }
  // The online server must perform clinical release checks and stamp the actual reviewer.
  if ((offlinePending || offlineMode || !navigator.onLine) && changesReviewedResult(offlineWorking || offlineBase, db)) {
    db = offlineClone(offlineWorking || offlineBase);
    render();
    notify('Connect to validate or amend a reviewed result. Your earlier offline drafts remain saved.');
    return false;
  }
  if (!offlinePending && !offlineMode && navigator.onLine) {
    const ok = await offlineOriginalSave(message);
    if (ok) {
      offlineBase = offlineClone(db);
      offlineWorking = offlineClone(db);
      try { await offlinePersist(); }
      catch (error) { notify('Saved to server. Offline cache could not be updated on this device.'); }
      return true;
    }
    if (!lastSaveError?.transportFailure && lastSaveError?.status!==409) return false;
  }
  try {
    if (!offlineBase) throw new Error('No authorized offline snapshot is available.');
    const priorWorking = offlineWorking, priorPending = offlinePending;
    offlineWorking = offlineClone(db);
    offlinePending = true;
    offlineMode = true;
    try { await offlinePersist(); }
    catch (error) { offlineWorking = priorWorking; offlinePending = priorPending; throw error; }
    unsaved = false;
    render();
    notify('Saved securely on this device. It will sync when connected.');
    if (navigator.onLine) void syncOfflineChanges();
    return true;
  } catch (error) {
    unsaved = true;
    notify('Could not save offline. Keep this page open and export a backup: ' + error.message);
    return false;
  }
};

async function syncOfflineChanges(knownLatest) {
  if (!currentUser || !offlinePending || offlineSyncing || !navigator.onLine || offlineConflict.length) return;
  const session=workspaceSession;
  offlineSyncing = true;
  saving = true;
  document.body.classList.add('saving');
  offlineStatus();
  try {
    const me = await api('/api/me');
    if (me.user.email !== currentUser.email) throw new Error('Sign in as the original staff account to sync these changes.');
    const latest = typeof recordDelta==='function' ? await api('/api/state/read','POST',{scope:recordDelta(offlineBase,offlineWorking).scope}) : knownLatest || await api('/api/state');
    const merged = mergeWorkspace(offlineBase, offlineWorking, latest.data);
    if (merged.conflicts.length) {
      offlineConflict = merged.conflicts;
      notify('Another staff member edited the same record. Your local changes are preserved for review.');
      return;
    }
    let result = latest;
    if (JSON.stringify(merged.data) !== JSON.stringify(latest.data)) {
      result = await api('/api/state', 'PUT', { revision: latest.revision, data: merged.data });
    }
    db = result.data;
    serverRevision = result.revision;
    offlineBase = offlineClone(db);
    offlineWorking = offlineClone(db);
    offlinePending = false;
    offlineMode = false;
    unsaved = false;
    render();
    try{await offlinePersist()}catch(error){notify('Synchronized with the server. Offline cache could not be updated.')}
    notify('Offline changes synchronized with the shared workspace.');
  } catch (error) {
    offlineMode = error.transportFailure===true;
    if (!error.transportFailure) notify('Sync paused: ' + error.message + '. Your local changes are preserved.');
  } finally {
    if(session!==workspaceSession)return;
    offlineSyncing = false;
    saving = false;
    document.body.classList.remove('saving');
    offlineStatus();
  }
}

const offlineOriginalReload = reloadShared;
reloadShared = async function() {
  if (offlinePending) { notify('Local changes are waiting to sync. Reload is disabled to protect them.'); return; }
  if (!navigator.onLine) { notify('Reconnect to refresh shared records.'); return; }
  await offlineOriginalReload();
  if (!unsaved && currentUser) {
    offlineBase = offlineClone(db);
    offlineWorking = offlineClone(db);
    offlineMode = false;
    try { await offlinePersist(); } catch (error) { notify('Reloaded, but could not update offline cache.'); }
  }
};

const offlineOriginalSignOut = manualSignOut;
manualSignOut = function() {
  offlineKey = null;
  offlineSalt = null;
  offlineBase = null;
  offlineWorking = null;
  offlinePending = false;
  offlineMode = false;
  offlineConflict = [];
  offlineCacheLocked=false;offlineSyncing=false;
  offlineOriginalSignOut();
};

const offlineOriginalRender = render;
render = function() {
  offlineOriginalRender();
  offlineStatus();
};

window.addEventListener('online', () => {
  if (!currentUser) return;
  if (offlinePending) void syncOfflineChanges();
  else if (!unsaved && !document.getElementById('modal').open) void reloadShared();
  else { offlineMode = false; offlineStatus(); }
});
document.getElementById('modal').addEventListener('close', () => {
  if (currentUser && !offlinePending && !unsaved && navigator.onLine && offlineMode) void reloadShared();
});
window.addEventListener('focus', () => { if (currentUser && offlinePending && navigator.onLine) void syncOfflineChanges(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});

window.addEventListener('beforeunload',event=>{if(unsaved||saving||offlineSyncing){event.preventDefault();event.returnValue=''}});

async function reviewOfflineConflicts(){
 if(!currentUser||offlineSyncing||saving)return;
 if(document.getElementById('modal').open)return notify('Close your current form before reviewing conflicts.');
 try{
  const latest=await api('/api/state/read','POST',{scope:recordDelta(offlineBase,offlineWorking).scope});
  const base=offlineClone(offlineBase),local=offlineClone(offlineWorking),merged=mergeWorkspace(base,local,latest.data);
  if(!merged.conflicts.length){offlineConflict=[];await syncOfflineChanges();return}
  const value=(data,key)=>{const i=key.indexOf(': '),field=key.slice(0,i),id=key.slice(i+2);return field==='testConfig'?data.testConfig?.[id]:data[field]?.find(r=>r.id===id)};
  modal('Review synchronization conflicts','<p class="help full">Choose which version to keep for each record. Saving checks the current shared revision again; another staff member’s later edits remain protected.</p>'+merged.conflicts.map((key,i)=>'<section class="full clinical-check"><h3>'+esc(key)+'</h3><details><summary>View both versions</summary><p>On this device</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(JSON.stringify(value(local,key),null,2)||'Deleted')+'</pre><p>Shared records</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(JSON.stringify(value(latest.data,key),null,2)||'Deleted')+'</pre></details>'+select('conflict_'+i,'Version to keep',[['','Choose a version'],['shared','Keep shared version'],['local','Keep device version']])+'</section>').join(''),async values=>{
   const choices=Object.fromEntries(merged.conflicts.map((key,i)=>[key,values['conflict_'+i]]));
   const resolved=resolveWorkspaceConflicts(base,local,latest.data,choices);
   if(changesReviewedResult(latest.data,resolved))throw new Error('Reviewed result changes need the online amendment workflow. Keep the shared reviewed version here.');
   const prior={base:offlineBase,working:offlineWorking,db,revision:serverRevision};
   offlineBase=offlineClone(latest.data);offlineWorking=offlineClone(resolved);db=resolved;serverRevision=latest.revision;
   try{await offlinePersist()}catch(error){offlineBase=prior.base;offlineWorking=prior.working;db=prior.db;serverRevision=prior.revision;throw error}
   offlineConflict=[];setTimeout(()=>void syncOfflineChanges(),0);return true;
  },'Apply choices and sync');makeWide();
 }catch(error){notify(error.message)}
}
