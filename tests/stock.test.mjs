import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {verifyStocks} from './stock-scenarios.mjs';
import {quantityUnits,testPerformed,listStock} from '../worker/stock.js';
test('stock ledger: automatic deductions, decimal quantities, restock retries, no repeat charge, history, access and stale writes',async()=>{
 const db=new DatabaseSync(':memory:');for(const file of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')))db.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const env={DB:{prepare(sql){return {bind(...args){return {async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){return db.prepare(sql).run(...args)}}}}},async batch(commands){db.exec('BEGIN');try{const results=[];for(const c of commands)results.push(await c.run());db.exec('COMMIT');return results}catch(e){db.exec('ROLLBACK');throw e}}}};
 await verifyStocks(env);
 // Upgrade from the existing Ghana starter version: add the new batch without resetting balances.
 db.exec("DELETE FROM stock_movements WHERE item_id LIKE 'US_STOCK_%'; DELETE FROM stock_links WHERE item_id LIKE 'US_STOCK_%'; DELETE FROM stock_items WHERE id LIKE 'US_STOCK_%'; DELETE FROM audit WHERE id='stock-starter-ultrasound-v1';");
 const upgraded=await listStock(env,{role:'admin',email:'owner@example.com'});assert.equal(upgraded.items.filter(i=>i.category==='Ultrasound supplies').length,8);assert.equal(upgraded.items.find(i=>i.id==='GH_STOCK_malaria').balance,24);
 const repeat=await listStock(env,{role:'admin',email:'owner@example.com'});assert.equal(repeat.items.length,upgraded.items.length);assert.equal(repeat.items.find(i=>i.id==='US_STOCK_gel').balance,0);db.close();
});
test('performed tests exclude empty and not-performed results, and quantity precision is bounded',()=>{assert.equal(testPerformed({resultRows:[{state:'Not performed',value:'5'}]}),false);assert.equal(testPerformed({resultRows:[{state:'Result',value:0}]}),true);assert.equal(quantityUnits('0.000001'),1);for(const v of [true,'',NaN,'0.0000001',1000001])assert.throws(()=>quantityUnits(v));});
