import {GHANA_STOCK_SUPPLIES,ULTRASOUND_STOCK_SUPPLIES} from '../shared/stock-supplies.js';
import {can,requirePermission} from './permissions.js';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const ready=new WeakMap(),SCALE=1000000;
const table=(env,name)=>(env.DB.sql?'knox.':'')+name;
const q=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
export const quantityUnits=value=>{const n=Number(value);if(!['number','string'].includes(typeof value)||String(value).trim()===''||!Number.isFinite(n)||Math.abs(n)>1000000||Math.abs(n*SCALE-Math.round(n*SCALE))>.001)fail(400,'Enter a quantity up to 1,000,000 with at most six decimal places.');return Math.round(n*SCALE)};
const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
export function testPerformed(order){return !!order&&(Array.isArray(order.resultRows)?order.resultRows.some(r=>(!r.state||r.state==='Result')&&String(r.value??'').trim()!==''):!!String(order.result??'').trim())}
export async function ensureStock(env){
 if(!ready.has(env.DB))ready.set(env.DB,(async()=>{
  if(env.DB.sql){const commands=[
   'CREATE TABLE IF NOT EXISTS knox.stock_items(id TEXT PRIMARY KEY,name TEXT NOT NULL,unit TEXT NOT NULL,minimum BIGINT NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,version INTEGER NOT NULL DEFAULT 1,created TEXT NOT NULL)',
   'CREATE TABLE IF NOT EXISTS knox.stock_links(item_id TEXT NOT NULL,test_id TEXT NOT NULL,per_test BIGINT NOT NULL)',
   'CREATE UNIQUE INDEX IF NOT EXISTS stock_link_unique ON knox.stock_links(item_id,test_id)',
   'CREATE TABLE IF NOT EXISTS knox.stock_movements(id TEXT PRIMARY KEY,item_id TEXT NOT NULL,kind TEXT NOT NULL,quantity BIGINT NOT NULL,order_id TEXT,test_id TEXT,reason TEXT NOT NULL,actor TEXT NOT NULL,created TEXT NOT NULL)',
   'CREATE UNIQUE INDEX IF NOT EXISTS stock_order_once ON knox.stock_movements(item_id,order_id)',
   'CREATE INDEX IF NOT EXISTS stock_history ON knox.stock_movements(item_id,created)',
   'CREATE TABLE IF NOT EXISTS knox.stock_write_guard(id INTEGER PRIMARY KEY,revision INTEGER NOT NULL)'];
   await env.DB.batch(commands.map(sql=>q(env,sql)));
  }
  await q(env,`INSERT INTO ${table(env,'stock_write_guard')}(id,revision) VALUES(1,0) ON CONFLICT(id) DO NOTHING`).run();
 })().catch(e=>{ready.delete(env.DB);throw e}));
 await ready.get(env.DB);
}
async function seedSupplies(env,user,supplies,marker,label){
 if(!can(user,'stockManage'))return;
 if(await q(env,'SELECT id FROM audit WHERE id=?',marker).first())return;
 const normalize=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
 const existing=(await q(env,`SELECT id,name FROM ${table(env,'stock_items')}`).all()).results;
 const existingNames=new Set(existing.map(i=>normalize(i.name))),commands=[],created=new Date().toISOString();
 const linked=(await q(env,`SELECT l.test_id FROM ${table(env,'stock_links')} l JOIN ${table(env,'stock_items')} i ON i.id=l.item_id WHERE i.unit='tests'`).all()).results;
 for(const item of supplies){if(existing.some(i=>i.id===item.id)||[item.name,...item.aliases].some(name=>existingNames.has(normalize(name)))||item.links.some(l=>linked.some(x=>x.test_id===l.testId)))continue;
  commands.push(q(env,`INSERT INTO ${table(env,'stock_items')}(id,name,unit,minimum,active,version,created) VALUES(?,?,?,0,1,1,?) ON CONFLICT(id) DO NOTHING`,item.id,item.name,item.unit,created));
  commands.push(q(env,`INSERT INTO ${table(env,'stock_movements')}(id,item_id,kind,quantity,reason,actor,created) VALUES(?,?,'opening',0,'Starter supply: enter actual count',?,?) ON CONFLICT(id) DO NOTHING`,'opening:'+item.id,item.id,user.email,created));
  for(const link of item.links)commands.push(q(env,`INSERT INTO ${table(env,'stock_links')}(item_id,test_id,per_test) VALUES(?,?,?) ON CONFLICT(item_id,test_id) DO NOTHING`,item.id,link.testId,quantityUnits(link.perTest)));
 }
 commands.push(q(env,'INSERT INTO audit(id,actor,action,created) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING',marker,user.email,'Added '+label+' starter supplies; all opening counts zero',created));
 await env.DB.batch(commands);
}
async function addStarterSupplies(env,user){
 await seedSupplies(env,user,GHANA_STOCK_SUPPLIES,'stock-starter-ghana-v1','Ghana laboratory');
 await seedSupplies(env,user,ULTRASOUND_STOCK_SUPPLIES,'stock-starter-ultrasound-v1','ultrasound');
}
// Invoked within the same database transaction as a successful clinical save.
export async function stockConsumption(env,user,before,after){
 const completed=['orders','ultrasoundReports'].flatMap(k=>(after[k]||[]).filter(o=>!testPerformed((before[k]||[]).find(p=>p.id===o.id))&&testPerformed(o)).map(o=>({...o,stockOrderId:(k==='orders'?'':'US:')+o.id})));
 if(!completed.length)return [];await ensureStock(env);
 const items=table(env,'stock_items'),links=table(env,'stock_links'),movements=table(env,'stock_movements');
 return completed.map(o=>q(env,`INSERT INTO ${movements}(id,item_id,kind,quantity,order_id,test_id,reason,actor,created) SELECT ? || ':' || i.id,i.id,'usage',-l.per_test,?,?,?, ?,? FROM ${items} i JOIN ${links} l ON l.item_id=i.id WHERE i.active=1 AND l.test_id=? ON CONFLICT(item_id,order_id) DO NOTHING`,'use:'+o.stockOrderId,o.stockOrderId,o.testId||'',String(o.test||o.testId||'Test').slice(0,200),user.email,new Date().toISOString(),o.testId||''));
}
export async function listStock(env,user,itemId=''){
 requirePermission(user,'stockView');await ensureStock(env);await addStarterSupplies(env,user);
 const items=table(env,'stock_items'),movements=table(env,'stock_movements'),links=table(env,'stock_links');
 const rows=(await q(env,`SELECT i.*,COALESCE(SUM(m.quantity),0) AS balance,COALESCE(SUM(CASE WHEN m.kind IN ('opening','restock') THEN m.quantity ELSE 0 END),0) AS received,COALESCE(SUM(CASE WHEN m.kind='usage' THEN -m.quantity ELSE 0 END),0) AS used,COALESCE(SUM(CASE WHEN m.kind='adjustment' THEN m.quantity ELSE 0 END),0) AS adjusted FROM ${items} i LEFT JOIN ${movements} m ON m.item_id=i.id GROUP BY i.id ORDER BY lower(i.name),i.id LIMIT 1001`).all()).results;
 const mappings=(await q(env,`SELECT item_id,test_id,per_test FROM ${links} ORDER BY item_id,test_id`).all()).results;
 let history=[];if(itemId){if(!validId(itemId))fail(400,'Invalid stock item');history=(await q(env,`SELECT id,kind,quantity,order_id,test_id,reason,actor,created FROM ${movements} WHERE item_id=? ORDER BY created DESC,id DESC LIMIT 100`,itemId).all()).results.map(m=>({...m,quantity:Number(m.quantity)/SCALE}));}
 return {items:rows.slice(0,1000).map(r=>({...r,category:[...GHANA_STOCK_SUPPLIES,...ULTRASOUND_STOCK_SUPPLIES].find(i=>i.id===r.id)?.category||'Custom supplies',minimum:Number(r.minimum)/SCALE,balance:Number(r.balance)/SCALE,received:Number(r.received)/SCALE,used:Number(r.used)/SCALE,adjusted:Number(r.adjusted)/SCALE,links:mappings.filter(m=>m.item_id===r.id).map(m=>({testId:m.test_id,perTest:Number(m.per_test)/SCALE}))})),hasMore:rows.length>1000,history};
}
export async function saveStockItem(env,user,b){
 requirePermission(user,'stockManage');requirePermission(user,'stockView');
 if(!validId(b.id))fail(400,'Invalid stock item ID');
 const name=String(b.name||'').trim(),unit=String(b.unit||'').trim(),minimum=quantityUnits(b.minimum??0),opening=quantityUnits(b.opening??0);
 if(!name||name.length>100||!unit||unit.length>30||minimum<0||opening<0)fail(400,'Enter an item name, unit and non-negative quantities.');
 if(!Array.isArray(b.links)||b.links.length>100||b.links.some(l=>!validId(l.testId)||quantityUnits(l.perTest)<=0)||new Set(b.links.map(l=>l.testId)).size!==b.links.length)fail(400,'Select unique tests with a positive quantity used per test.');
 await ensureStock(env);const items=table(env,'stock_items'),links=table(env,'stock_links'),movements=table(env,'stock_movements');
 const old=await q(env,`SELECT * FROM ${items} WHERE id=?`,b.id).first();
 if(old&&b.version===undefined){const openingRow=await q(env,`SELECT quantity FROM ${movements} WHERE id=?`,'opening:'+b.id).first();const savedLinks=(await q(env,`SELECT test_id,per_test FROM ${links} WHERE item_id=? ORDER BY test_id`,b.id).all()).results;const expected=b.links.map(l=>({test_id:l.testId,per_test:quantityUnits(l.perTest)})).sort((a,b)=>a.test_id.localeCompare(b.test_id));if(old.name===name&&old.unit===unit&&Number(old.minimum)===minimum&&Number(openingRow?.quantity)===opening&&JSON.stringify(savedLinks.map(l=>({...l,per_test:Number(l.per_test)})))===JSON.stringify(expected))return {ok:true};fail(409,'Item already exists. Reload before editing.');}
 if(old&&old.unit!==unit)fail(400,'Keep the original stock unit. Convert deliveries into that unit before adding them.');
 if(old&&Number(b.version)!==Number(old.version))fail(409,'This item changed. Reload stock records before editing.');
 if(!old&&b.version!==undefined)fail(404,'Stock item not found');
 const commands=[];
 if(old){
  if(env.DB.sql)commands.push(q(env,`WITH changed AS (UPDATE ${items} SET name=?,minimum=?,active=?,version=version+1 WHERE id=? AND version=? RETURNING version) UPDATE ${table(env,'stock_write_guard')} SET revision=(SELECT version FROM changed) WHERE id=1`,name,minimum,b.active===false?0:1,b.id,b.version));
  else{commands.push(q(env,`UPDATE ${items} SET name=?,minimum=?,active=?,version=version+1 WHERE id=? AND version=?`,name,minimum,b.active===false?0:1,b.id,b.version));commands.push(q(env,`UPDATE ${table(env,'stock_write_guard')} SET revision=CASE WHEN changes()=1 THEN ? ELSE NULL END WHERE id=1`,Number(b.version)+1));}
 }else{commands.push(q(env,`INSERT INTO ${items}(id,name,unit,minimum,active,version,created) VALUES(?,?,?,?,1,1,?)`,b.id,name,unit,minimum,new Date().toISOString()));commands.push(q(env,`INSERT INTO ${movements}(id,item_id,kind,quantity,reason,actor,created) VALUES(?,?,'opening',?,'Opening balance',?,?)`,'opening:'+b.id,b.id,opening,user.email,new Date().toISOString()));}
 commands.push(q(env,`DELETE FROM ${links} WHERE item_id=?`,b.id));for(const l of b.links)commands.push(q(env,`INSERT INTO ${links}(item_id,test_id,per_test) VALUES(?,?,?)`,b.id,l.testId,quantityUnits(l.perTest)));
 commands.push(q(env,'INSERT INTO audit(id,actor,action,created) VALUES(?,?,?,?)',crypto.randomUUID(),user.email,'Stock item configured: '+name,new Date().toISOString()));
 try{await env.DB.batch(commands);}catch(e){if(e.code==='40001'||e.code==='23502'||/constraint|unique/i.test(e.message))fail(409,'Stock item changed. Reload stock records and retry.');throw e}
 return {ok:true};
}
export async function recordStockMovement(env,user,b){
 requirePermission(user,'stockManage');requirePermission(user,'stockView');if(!validId(b.id)||!validId(b.itemId)||!['restock','adjustment'].includes(b.kind))fail(400,'Invalid stock entry');
 const quantity=quantityUnits(b.quantity),reason=String(b.reason||'').trim();if(!quantity||(b.kind==='restock'&&quantity<0)||!reason||reason.length>300)fail(400,'Enter a quantity and a delivery or adjustment reason.');
 await ensureStock(env);const item=await q(env,`SELECT id FROM ${table(env,'stock_items')} WHERE id=?`,b.itemId).first();if(!item)fail(404,'Stock item not found');
 await q(env,`INSERT INTO ${table(env,'stock_movements')}(id,item_id,kind,quantity,reason,actor,created) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`,b.id,b.itemId,b.kind,quantity,reason,user.email,new Date().toISOString()).run();
 const entry=await q(env,`SELECT * FROM ${table(env,'stock_movements')} WHERE id=?`,b.id).first();if(entry.item_id!==b.itemId||entry.kind!==b.kind||Number(entry.quantity)!==quantity||entry.reason!==reason||entry.actor!==user.email)fail(409,'This entry ID was already used. Open a new stock entry.');return {ok:true};
}
