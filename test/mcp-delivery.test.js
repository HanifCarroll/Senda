import test from 'node:test';
import assert from 'node:assert/strict';
import {createAgentHandler} from '../src/server/tools.js';
import {observeMcpResponse} from '../src/server/mcp-delivery.js';

const privateMarker='PRIVATE-DIAG-SENTINEL';
const actor={userId:privateMarker,scopes:['projects:read']};
const origin='https://senda.example';
function request(id=1){return new Request(origin+'/mcp?private='+privateMarker,{method:'POST',headers:{
 'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18',authorization:'Bearer '+privateMarker,
},body:JSON.stringify({jsonrpc:'2.0',id:privateMarker+'-'+id,method:'tools/call',params:{name:'list_projects',arguments:{}}})})}
function messages(text){return text.split(/\r?\n\r?\n/).map(block=>block.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n')).filter(Boolean).map(JSON.parse)}
async function capture(action){
 const previous=console.info,logs=[];
 console.info=(label,value)=>{if(label.startsWith('Senda MCP'))logs.push({label,...JSON.parse(value)});else previous(label,value)};
 try{await action(logs)}finally{console.info=previous}
}
const delivery=logs=>logs.filter(l=>l.label==='Senda MCP delivery');

test('MCP completion reports bytes and generated call IDs after the actual response stream ends, without private data',async()=>capture(async logs=>{
 const expected=[{id:'fixture',name:privateMarker}],handler=createAgentHandler({list:async()=>expected},actor,origin);
 try{
  const response=await handler.fetch(request());assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'text/event-stream');assert.equal(response.headers.get('cache-control'),'no-cache, no-transform');
  assert.equal(delivery(logs).length,0,'An unread stream is not recorded as complete');
  const text=await response.text(),[message]=messages(text),callId=message.result._meta['senda/callId'];
  assert.equal(message.id,privateMarker+'-1');assert.deepEqual(JSON.parse(message.result.content[0].text),expected);
  assert.match(callId,/^[0-9a-f-]{36}$/);
  const [record]=delivery(logs);assert.ok(record,'Record server stream completion');
  assert.equal(delivery(logs).length,1);assert.equal(record.outcome,'complete');assert.equal(record.status,200);assert.equal(record.bytes,Buffer.byteLength(text));
  assert.deepEqual(record.callIds,[callId]);assert.ok(record.elapsedMs>=0);
  assert.equal(logs.find(l=>l.label==='Senda MCP result').callId,callId);
  assert.ok(!JSON.stringify(logs).includes(privateMarker));
 }finally{await handler.close()}
}));

test('concurrent requests through one MCP handler keep response delivery correlations separate',async()=>capture(async logs=>{
 let calls=0;const handler=createAgentHandler({list:async()=>{const n=++calls;await new Promise(r=>setTimeout(r,n===1?8:0));return[{id:String(n)}]}},actor,origin);
 try{
  const texts=await Promise.all([1,2].map(async id=>(await handler.fetch(request(id))).text()));
  const ids=texts.map(text=>messages(text)[0].result._meta['senda/callId']);assert.equal(new Set(ids).size,2);
  assert.equal(delivery(logs).length,2);for(const id of ids)assert.equal(delivery(logs).filter(r=>r.callIds.length===1&&r.callIds[0]===id).length,1);
  assert.ok(!JSON.stringify(logs).includes(privateMarker));
 }finally{await handler.close()}
}));

test('canceling the real MCP response records cancellation rather than completion and never replays the tool',async()=>capture(async logs=>{
 let calls=0,start;const begun=new Promise(resolve=>{start=resolve});
 const handler=createAgentHandler({list:async()=>{calls++;start();return[]}},actor,origin);
 try{
  const response=await handler.fetch(request());await begun;await response.body.cancel(new Error(privateMarker));
  await new Promise(r=>setImmediate(r));
  assert.equal(delivery(logs).length,1);assert.equal(delivery(logs)[0].outcome,'canceled');assert.equal(delivery(logs)[0].bytes,0);
  assert.equal(calls,1);assert.equal(delivery(logs)[0].callIds.length,1);assert.match(delivery(logs)[0].callIds[0],/^[0-9a-f-]{36}$/);assert.ok(!JSON.stringify(logs).includes(privateMarker));
 }finally{await handler.close()}
}));

test('SDK rejection diagnostics contain only safe error type and numeric code',async()=>capture(async logs=>{
 const handler=createAgentHandler({},actor,origin);
 try{
  const response=await handler.fetch(new Request(origin+'/mcp?'+privateMarker,{method:'POST',headers:{'content-type':'text/'+privateMarker},body:privateMarker}));
  assert.equal(response.status,415);await response.text();
  const [record]=logs.filter(l=>l.label==='Senda MCP transport error');assert.ok(record,'Observe SDK serving errors');assert.equal(record.name,'Error');
  if(record.code!==undefined)assert.ok(Number.isSafeInteger(record.code));
  assert.deepEqual(Object.keys(record).sort(),record.code===undefined?['callIds','label','name']:['callIds','code','label','name']);
  assert.ok(!JSON.stringify(logs).includes(privateMarker));
 }finally{await handler.close()}
}));

test('a failing diagnostic sink cannot change a successful MCP response',async()=>{
 const handler=createAgentHandler({list:async()=>[{id:'fixture'}]},actor,origin),previous=console.info;
 console.info=()=>{throw new Error(privateMarker)};
 try{const response=await handler.fetch(request());assert.equal(response.status,200);const [message]=messages(await response.text());assert.equal(message.result.isError,undefined);assert.deepEqual(JSON.parse(message.result.content[0].text),[{id:'fixture'}]);}
 finally{console.info=previous;await handler.close()}
});

test('stream observation preserves backpressure, cancellation reason and rejection, response status and headers',async()=>capture(async logs=>{
 let pulls=0,canceled;const reason=new Error(privateMarker),failure=new Error('cancel failed');
 const source=new ReadableStream({pull(c){pulls++;c.enqueue(new Uint8Array([1,2,3]))},cancel(value){canceled=value;throw failure}},{highWaterMark:0});
 const original=new Response(source,{status:201,statusText:'Created',headers:{'content-type':'text/event-stream','x-fixture':'kept'}});
 const response=observeMcpResponse(original,{callIds:['server-generated-fixture'],started:performance.now()});
 await Promise.resolve();assert.equal(pulls,0);assert.equal(response.status,201);assert.equal(response.statusText,'Created');assert.deepEqual([...response.headers],[...original.headers]);
 const reader=response.body.getReader();assert.deepEqual((await reader.read()).value,new Uint8Array([1,2,3]));
 await Promise.resolve();assert.equal(pulls,1,'The observer never reads ahead of downstream demand');
 await assert.rejects(reader.cancel(reason),e=>e===failure);assert.equal(canceled,reason);
 assert.deepEqual(delivery(logs).map(r=>[r.outcome,r.bytes]),[['canceled',3]]);assert.ok(!JSON.stringify(logs).includes(privateMarker));
}));

test('a source stream error reaches the consumer unchanged and is recorded without its message',async()=>capture(async logs=>{
 let pulls=0;const failure=new Error(privateMarker),source=new ReadableStream({pull(c){if(++pulls===1)c.enqueue(new Uint8Array([1,2]));else throw failure}},{highWaterMark:0});
 const response=observeMcpResponse(new Response(source),{callIds:[],started:performance.now()}),reader=response.body.getReader();
 assert.deepEqual((await reader.read()).value,new Uint8Array([1,2]));await assert.rejects(reader.read(),e=>e===failure);
 assert.deepEqual(delivery(logs).map(r=>[r.outcome,r.bytes]),[['error',2]]);assert.ok(!JSON.stringify(logs).includes(privateMarker));
}));

test('canceling while a source read is pending settles the read and releases the source lock once',async()=>capture(async logs=>{
 let begin,canceled;
 const begun=new Promise(resolve=>{begin=resolve}),reason=new Error(privateMarker);
 const source=new ReadableStream({pull(){begin()},cancel(value){canceled=value}},{highWaterMark:0});
 const response=observeMcpResponse(new Response(source),{callIds:['pending-read'],started:performance.now()});
 const reader=response.body.getReader(),pending=reader.read();
 await begun;await reader.cancel(reason);
 assert.deepEqual(await pending,{done:true,value:undefined});assert.equal(canceled,reason);assert.equal(source.locked,false);
 assert.deepEqual(delivery(logs).map(r=>[r.outcome,r.bytes]),[['canceled',0]]);
 assert.ok(!JSON.stringify(logs).includes(privateMarker));
}));
