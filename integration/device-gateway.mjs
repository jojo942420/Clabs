// Brand-neutral local gateway. Runs on the laboratory network, never in the hosted Worker.
import net from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
const config=process.env.KNOX_CONFIG_FILE?JSON.parse(fs.readFileSync(process.env.KNOX_CONFIG_FILE,'utf8')):{};
const endpoint=process.env.KNOX_ENDPOINT||config.endpoint,token=process.env.KNOX_INTERFACE_TOKEN||config.token,siteToken=process.env.KNOX_SITE_ACCESS_TOKEN||'';
if(!endpoint||!token||!endpoint.startsWith('https://'))throw new Error('Load the downloaded configuration with KNOX_CONFIG_FILE or set the HTTPS endpoint and interface token.');
const root=endpoint.replace(/\/messages$/,''),host=process.env.GATEWAY_HOST||'127.0.0.1';
const headers={'Content-Type':'application/json',Authorization:'Bearer '+token,...(siteToken?{'OAI-Sites-Authorization':siteToken}:{})};
async function api(path,data){const response=await fetch(root+path,{method:data?'POST':'GET',headers,body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(30000)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Gateway rejected: '+response.status);return result}
let protocol=config.protocol||'AUTO';
const settings=await api('/configuration');protocol=settings.protocol;console.log('Device configuration loaded:',settings.name,settings.model,settings.status);
async function send(payload){const format=payload.format==='hl7'?'hl7':'json';const connected=await api('/connect',{format,model:config.model});protocol=connected.protocol;const response=await api('/messages',payload);if(response.configuration?.unmappedCodes?.length)console.warn('Mapping required for:',response.configuration.unmappedCodes.join(', '));return response}
function ack(raw,code){const msh=raw.split(/\r\n|\r|\n/)[0].split('|'),mid=msh[9]||'';return '\x0bMSH|^~\\&|KNOX||||||ACK|'+Date.now()+'|P|2.3.1\rMSA|'+code+'|'+(/^[A-Za-z0-9_.-]{1,160}$/.test(mid)?mid:'invalid')+'\r\x1c\r'}
if(protocol!=='JSON'){
 const server=net.createServer(socket=>{let buffer='',chain=Promise.resolve();socket.setTimeout(120000,()=>socket.destroy());socket.on('error',()=>{});socket.on('data',chunk=>{buffer+=chunk.toString('utf8');if(Buffer.byteLength(buffer)>250000){socket.destroy();return}let end;while((end=buffer.indexOf('\x1c\r'))>=0){const frame=buffer.slice(0,end),start=frame.indexOf('\x0b');buffer=buffer.slice(end+2);if(start<0){socket.destroy();return}const raw=frame.slice(start+1);chain=chain.then(async()=>{let code='AE';try{const response=await send({format:'hl7',raw});if(response.accepted)code='AA'}catch(e){console.error('HL7 delivery failed:',e.message)}if(!socket.destroyed)socket.write(ack(raw,code))}).catch(()=>socket.destroy())}})});
 server.listen(Number(process.env.MLLP_PORT||2575),host,()=>console.log('HL7 MLLP listener ready on',host,process.env.MLLP_PORT||2575));
}
if(protocol!=='HL7'){
 const server=http.createServer(async(req,res)=>{if(req.method!=='POST'||req.url!=='/messages'){res.writeHead(404);res.end();return}let length=0,chunks=[];try{for await(const chunk of req){length+=chunk.length;if(length>250000){res.writeHead(413);res.end('Payload too large');return}chunks.push(chunk)}const payload=JSON.parse(Buffer.concat(chunks).toString());if(payload.format&&payload.format!=='json')throw new Error('JSON listener requires normalized JSON');const result=await send(payload);res.writeHead(202,{'Content-Type':'application/json'});res.end(JSON.stringify(result))}catch(e){res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({accepted:false,error:e.message}));}});
 server.requestTimeout=30000;server.listen(Number(process.env.JSON_PORT||8088),host,()=>console.log('Normalized JSON listener ready on',host,process.env.JSON_PORT||8088));
}
setInterval(()=>{if(protocol==='AUTO')return;api('/connect',{format:protocol==='HL7'?'hl7':'json',model:config.model}).catch(e=>console.error('Connection check failed:',e.message))},60000).unref();
