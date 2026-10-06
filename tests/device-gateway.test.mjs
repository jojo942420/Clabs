import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
const freePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port))})});
test('downloaded gateway configuration starts both auto listeners and acknowledges stored JSON and HL7',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'knox-device-'));
 const jsonPort=await freePort(),mllpPort=await freePort();
 await fs.writeFile(path.join(dir,'config.json'),JSON.stringify({endpoint:'https://synthetic.test/api/devices/qa/messages',token:'synthetic-test-token',model:'Synthetic model',protocol:'AUTO'}));
 await fs.writeFile(path.join(dir,'mock.mjs'),`globalThis.fetch=async(url,options)=>{if(options.headers.Authorization!=='Bearer synthetic-test-token')throw new Error('Missing token');const body=options.body?JSON.parse(options.body):null;if(String(url).endsWith('/configuration'))return Response.json({name:'QA',model:'Synthetic model',status:'Awaiting gateway',protocol:'AUTO'});if(String(url).endsWith('/connect')){if(body.model!=='Synthetic model')throw new Error('Wrong model');return Response.json({protocol:body.format==='hl7'?'HL7':'JSON'});}if(!body?.messageId&&!body?.raw)throw new Error('Missing payload');return Response.json({accepted:true,status:'pending_review',configuration:{unmappedCodes:[]}}, {status:202});};`);
 const child=spawn(process.execPath,['--import',path.join(dir,'mock.mjs'),new URL('../integration/device-gateway.mjs',import.meta.url).pathname],{env:{...process.env,KNOX_CONFIG_FILE:path.join(dir,'config.json'),KNOX_ENDPOINT:'',KNOX_INTERFACE_TOKEN:'',GATEWAY_HOST:'127.0.0.1',JSON_PORT:String(jsonPort),MLLP_PORT:String(mllpPort)},stdio:['ignore','pipe','pipe']});
 try{
 await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(new Error('Gateway did not start')),5000);child.stdout.on('data',b=>{output+=b;if(output.includes('JSON listener ready')&&output.includes('MLLP listener ready')){clearTimeout(timer);resolve()}});child.once('exit',code=>{clearTimeout(timer);reject(new Error('Gateway exited '+code))})});
 const response=await fetch('http://127.0.0.1:'+jsonPort+'/messages',{method:'POST',body:JSON.stringify({messageId:'QA1',sampleId:'TEST',results:[{code:'GLU',value:'5',unit:'mmol/L'}]})});assert.equal(response.status,202);assert.equal((await response.json()).accepted,true);
 const raw='MSH|^~\\&|QA||||||ORU^R01|QA2|P|2.3.1\rOBR|1||TEST\rOBX|1|NM|GLU||5|mmol/L|||||F\r';
 const ack=await new Promise((resolve,reject)=>{const s=net.createConnection({port:mllpPort,host:'127.0.0.1'},()=>s.write('\x0b'+raw+'\x1c\r'));s.setTimeout(5000,()=>{s.destroy();reject(new Error('No ACK'))});s.on('error',reject);s.on('data',b=>{s.destroy();resolve(b.toString())})});assert.match(ack,/MSA\|AA\|QA2/);
 }finally{child.kill();await new Promise(resolve=>child.once('exit',resolve));await fs.rm(dir,{recursive:true,force:true})}
});
