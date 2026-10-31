import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {memoryD1} from './fixtures/d1.js';
import {CloudProjects} from '../src/cloudflare/projects.js';
import {trialStatus,claimTrial} from '../src/cloudflare/agent-trial.js';
import {paidUsage} from '../src/cloudflare/agent-budget.js';
import {toolDefinitions,createAgentHandler} from '../src/server/tools.js';
import {createRequestHandler} from '../src/server/handler.js';
import {onboardingProposals} from '../examples/complex-onboarding/proposals.js';
import {HostedAgent} from '../src/cloudflare/agent.js';
import {reserveTurn} from '../src/cloudflare/agent-budget.js';

const week=7*24*60*60*1000,origin='https://senda.example';
function fixture(){
  const db=memoryD1();
  for(const name of readdirSync(new URL('../src/cloudflare/migrations/',import.meta.url)).sort())
    db.exec(readFileSync(new URL('../src/cloudflare/migrations/'+name,import.meta.url),'utf8'));
  const objects=new Map();let failDelete=false,clock=Date.parse('2026-10-31T12:00:00Z');
  const bucket={
    async put(key,value,options={}){objects.set(key,{value,metadata:options.customMetadata})},
    async get(key){const o=objects.get(key);return o?{text:async()=>o.value,customMetadata:o.metadata}:null},
    async delete(keys){if(failDelete)throw new Error('Storage temporarily unavailable');for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key)},
    async list({prefix='',cursor}={}){const keys=[...objects.keys()].filter(k=>k.startsWith(prefix)).sort(),start=Number(cursor||0),page=keys.slice(start,start+2);return{objects:page.map(key=>({key})),truncated:start+2<keys.length,cursor:String(start+2)}}
  };
  const actor={userId:'owner'},projects=new CloudProjects(db,bucket,{projectLimit:async()=>3,now:()=>clock});
  return{db,bucket,objects,projects,actor,advance:ms=>{clock+=ms},failDelete:value=>{failDelete=value},create:name=>projects.create(actor,{name,purpose:'Map customer requests',perspective:'Operations',source:{id:'Interview',kind:'transcript',title:'Interview',text:'We receive a request and review it.'}})};
}

test('deleting frees a Free slot and restoring preserves content but never restores agent grants',async()=>{
 const f=fixture();try{
  const p=await f.create('Requests'),second=await f.create('Orders');await f.create('Deliveries');
  await f.projects.grant(f.actor.userId,'analyst',p.id);
  const saved=await f.projects.read(f.actor,p.id);
  await assert.rejects(f.create('No room'),{code:'PROJECT_LIMIT'});
  const deleted=await f.projects.delete(f.actor,p.id);
  assert.equal(deleted.deleted,true);assert.equal(deleted.name,'Requests');
  assert.equal(Date.parse(deleted.restoreUntil)-Date.parse(deleted.deletedAt),week);
  assert.equal((await f.projects.list(f.actor)).length,2);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM senda_grants WHERE project=?').bind(p.id).first().n,0);
  await assert.rejects(f.projects.read({...f.actor,clientId:'analyst'},p.id),{code:'PROJECT_DELETED',message:'This project was deleted.'});
  await assert.rejects(f.projects.restore({userId:'another-owner'},p.id),{code:'NOT_FOUND'});
  assert.deepEqual(await f.projects.deleted({userId:'another-owner'}),[]);
  assert.equal((await f.projects.deleted(f.actor))[0].id,p.id);
  await f.create('New slot');
  await assert.rejects(f.projects.restore(f.actor,p.id),e=>e.code==='PROJECT_LIMIT'&&/delete|deleting/i.test(e.message)&&/Pro/.test(e.message));
  await f.projects.delete(f.actor,second.id);
  await f.projects.restore(f.actor,p.id);
  assert.deepEqual(await f.projects.read(f.actor,p.id),saved);
  await assert.rejects(f.projects.read({...f.actor,clientId:'analyst'},p.id),{code:'NOT_FOUND'});
 }finally{f.db.close()}
});

test('seven-day cleanup erases every model snapshot, old review cache and chat while keeping a minimal tombstone',async()=>{
 const f=fixture();try{
  const {proposals,texts}=await onboardingProposals(),p=await f.projects.create(f.actor,{name:'Private customer process',purpose:'Review onboarding',perspective:'Operations',source:{id:'Source_Transcript',kind:'transcript',title:'Interview',text:texts.Source_Transcript}});
  await f.projects.apply(f.actor,p.id,proposals[0]);
  await f.projects.createToBe(f.actor,p.id,{baselineRevision:2,brief:'Review requests automatically.'});
  const modelIds=f.db.prepare('SELECT id FROM senda_models WHERE project_id=?').bind(p.id).all().results.map(x=>x.id);
  for(const id of modelIds){await f.bucket.put(`review-cache/old-renderer/${id}/cached.json`,'private review');await f.bucket.put(`models/${id}/revisions/unpublished.json`,'private unpublished transcript')}
  await f.bucket.put('review-cache/unrelated/other-model/keep.json','another project');
  const chat=randomUUID();f.db.prepare('INSERT INTO senda_agent_chats(id,owner,project,created,updated,messages,display) VALUES(?,?,?,?,?,?,?)').bind(chat,f.actor.userId,p.id,'now','now','private prompt','private reply').run();
  assert.throws(()=>f.db.prepare('DELETE FROM senda_revisions WHERE model_id=?').bind(p.id).run(),/immutable/);
  await f.projects.delete(f.actor,p.id);f.advance(week-1);
  await f.projects.purgeDeleted();assert.ok(f.objects.size>1,'Content remains recoverable before expiry');
  await f.projects.restore(f.actor,p.id);assert.equal((await f.projects.read(f.actor,p.id,undefined,'to-be')).revision,1);
  await f.projects.delete(f.actor,p.id);f.advance(week);
  await assert.rejects(f.projects.restore(f.actor,p.id),{code:'RESTORE_EXPIRED'});
  assert.deepEqual(await f.projects.deleted(f.actor),[]);
  await f.projects.purgeDeleted();await f.projects.purgeDeleted();
  assert.deepEqual([...f.objects.keys()],['review-cache/unrelated/other-model/keep.json']);
  for(const table of ['senda_models','senda_revisions','senda_project_plans','senda_agent_chats'])assert.equal(f.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first().n,0,table);
  const tombstone=f.db.prepare('SELECT * FROM senda_projects WHERE id=?').bind(p.id).first();assert.ok(tombstone);assert.equal(tombstone.name,'');
  await assert.rejects(f.projects.read(f.actor,p.id),{code:'PROJECT_DELETED'});
 }finally{f.db.close()}
});

test('failed object cleanup keeps expired content inaccessible and retries without losing the model index',async()=>{
 const f=fixture();try{
  const p=await f.create('Requests');await f.projects.delete(f.actor,p.id);f.advance(week);f.failDelete(true);
  await assert.rejects(f.projects.purgeDeleted(),/Storage temporarily unavailable/);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM senda_models').first().n,1);
  await assert.rejects(f.projects.read(f.actor,p.id),{code:'PROJECT_DELETED'});
  await assert.rejects(f.projects.restore(f.actor,p.id),{code:'RESTORE_EXPIRED'});
  f.failDelete(false);await f.projects.purgeDeleted();assert.equal(f.objects.size,0);
 }finally{f.db.close()}
});

test('permanent cleanup includes the unpublished snapshot from a losing To-be race',async()=>{
 const f=fixture();try{
  const {proposals,texts}=await onboardingProposals(),p=await f.projects.create(f.actor,{name:'Requests',purpose:'Map onboarding',perspective:'Operations',source:{id:'Source_Transcript',kind:'transcript',title:'Interview',text:texts.Source_Transcript}});
  await f.projects.apply(f.actor,p.id,proposals[0]);
  f.failDelete(true);
  const raced=await Promise.allSettled(['A','B'].map(label=>f.projects.createToBe(f.actor,p.id,{baselineRevision:2,brief:'Private future brief '+label})));
  assert.equal(raced.filter(x=>x.status==='fulfilled').length,1);
  await f.projects.delete(f.actor,p.id);f.advance(week);f.failDelete(false);await f.projects.purgeDeleted();assert.equal(f.objects.size,0);
 }finally{f.db.close()}
});

test('a deletion-racing To-be upload remains discoverable when its first cleanup fails',async()=>{
 const f=fixture();try{
  const {proposals,texts}=await onboardingProposals(),p=await f.projects.create(f.actor,{name:'Requests',purpose:'Map onboarding',perspective:'Operations',source:{id:'Source_Transcript',kind:'transcript',title:'Interview',text:texts.Source_Transcript}});
  await f.projects.apply(f.actor,p.id,proposals[0]);const put=f.bucket.put;
  f.bucket.put=async(key,...args)=>{await put(key,...args);if(!key.startsWith(`models/${p.id}/`)){await f.projects.delete(f.actor,p.id);f.failDelete(true)}};
  await assert.rejects(f.projects.createToBe(f.actor,p.id,{baselineRevision:2,brief:'Private future brief'}),{code:'PROJECT_DELETED'});
  f.advance(week);f.failDelete(false);await f.projects.purgeDeleted();assert.equal(f.objects.size,0);
 }finally{f.db.close()}
});

test('an ambiguous To-be publication error never erases a committed snapshot',async()=>{
 const f=fixture();try{
  const {proposals,texts}=await onboardingProposals(),p=await f.projects.create(f.actor,{name:'Requests',purpose:'Map onboarding',perspective:'Operations',source:{id:'Source_Transcript',kind:'transcript',title:'Interview',text:texts.Source_Transcript}});
  await f.projects.apply(f.actor,p.id,proposals[0]);const batch=f.db.batch;
  f.db.batch=async statements=>{const result=batch(statements);throw new Error('Lost publication response')};
  await assert.rejects(f.projects.createToBe(f.actor,p.id,{baselineRevision:2,brief:'Keep this committed brief'}));f.db.batch=batch;
  assert.equal((await f.projects.read(f.actor,p.id,undefined,'to-be')).discovery.sources[0].text,'Keep this committed brief');
 }finally{f.db.close()}
});

test('a model opened before deletion cannot publish another snapshot afterwards',async()=>{
 const f=fixture();try{
  const p=await f.create('Requests'),opened=await f.projects.open(f.actor,p.id),snapshot=opened.store.read();
  await f.projects.delete(f.actor,p.id);
  await assert.rejects(opened.store.append(1,snapshot,'Late write'),{code:'PROJECT_DELETED'});
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM senda_revisions').first().n,1);assert.equal(f.objects.size,1);
 }finally{f.db.close()}
});

test('restoring never reauthorizes opened agent writes or prepared owner changes from before deletion',async()=>{
 const f=fixture();try{
  const p=await f.create('Requests');await f.projects.grant(f.actor.userId,'analyst',p.id);
  const opened=await f.projects.open({...f.actor,clientId:'analyst'},p.id),snapshot=opened.store.read();
  const prepared=await f.projects.preview(f.actor,p.id,{expectedRevision:1,summary:'Late notes',sources:[{id:'Late',kind:'document',title:'Late notes',text:'Private late notes'}]});
  await f.projects.delete(f.actor,p.id);await f.projects.restore(f.actor,p.id);
  await assert.rejects(opened.store.append(1,snapshot,'Pre-delete agent work'),{code:'STALE_PROJECT'});
  await assert.rejects(f.projects.applyPreview(f.actor,p.id,prepared),{code:'STALE_PROJECT'});
  assert.equal((await f.projects.read(f.actor,p.id)).revision,1);
 }finally{f.db.close()}
});

test('a pending grant cannot reappear after deletion and restoration',async()=>{
 const f=fixture();try{
  const p=await f.create('Requests'),authorize=f.projects.authorize.bind(f.projects);let resume,entered,first=true;
  const ready=new Promise(resolve=>{entered=resolve}),gate=new Promise(resolve=>{resume=resolve});
  f.projects.authorize=async(...args)=>{const row=await authorize(...args);if(first){first=false;entered();await gate}return row};
  const pending=f.projects.grant(f.actor.userId,'late-agent',p.id);await ready;
  await f.projects.delete(f.actor,p.id);await f.projects.restore(f.actor,p.id);resume();
  await assert.rejects(pending,{code:'STALE_PROJECT'});
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM senda_grants WHERE project=?').bind(p.id).first().n,0);
 }finally{f.db.close()}
});

test('delete and restore during a To-be upload invalidate the old publication',async()=>{
 const f=fixture();try{
  const {proposals,texts}=await onboardingProposals(),p=await f.projects.create(f.actor,{name:'Requests',purpose:'Map onboarding',perspective:'Operations',source:{id:'Source_Transcript',kind:'transcript',title:'Interview',text:texts.Source_Transcript}});
  await f.projects.apply(f.actor,p.id,proposals[0]);const put=f.bucket.put;
  f.bucket.put=async(key,...args)=>{await put(key,...args);if(!key.startsWith(`models/${p.id}/`)){await f.projects.delete(f.actor,p.id);await f.projects.restore(f.actor,p.id)}};
  await assert.rejects(f.projects.createToBe(f.actor,p.id,{baselineRevision:2,brief:'Pre-delete design brief'}),{code:'STALE_PROJECT'});
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM senda_project_plans WHERE project_id=?').bind(p.id).first().n,0);
 }finally{f.db.close()}
});

test('a To-be creation racing deletion cannot publish a model into the deleted project',async()=>{
 const f=fixture();try{
  const {proposals,texts}=await onboardingProposals(),p=await f.projects.create(f.actor,{name:'Requests',purpose:'Map onboarding',perspective:'Operations',source:{id:'Source_Transcript',kind:'transcript',title:'Interview',text:texts.Source_Transcript}});
  await f.projects.apply(f.actor,p.id,proposals[0]);
  const put=f.bucket.put;f.bucket.put=async(key,...args)=>{await put(key,...args);if(!key.startsWith(`models/${p.id}/`))await f.projects.delete(f.actor,p.id)};
  await assert.rejects(f.projects.createToBe(f.actor,p.id,{baselineRevision:2,brief:'Review requests automatically.'}),{code:'PROJECT_DELETED'});
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM senda_models').first().n,1);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM senda_project_plans').first().n,0);
 }finally{f.db.close()}
});

test('an in-progress built-in reply cannot reserve another provider call after its project is deleted',async()=>{
 const f=fixture();try{
  const p=await f.create('Requests'),chatId=randomUUID(),runId=randomUUID(),created=new Date().toISOString(),day=created.slice(0,10);
  f.db.prepare('INSERT INTO senda_agent_chats(id,owner,project,created,updated,lock_id,lock_until) VALUES(?,?,?,?,?,?,?)').bind(chatId,f.actor.userId,p.id,created,created,runId,Date.now()+600000).run();
  await reserveTurn(f.db,{runId,chatId,owner:f.actor.userId,day});
  let blocked;
  const agent=new HostedAgent({DB:f.db},f.projects,origin,{run:async options=>{
   await options.reserveCall('main');await options.settleCall({inputTokens:1000,outputTokens:100});
   await f.projects.delete(f.actor,p.id);
   try{await options.reserveCall('main')}catch(error){blocked=error.code;throw error}
   throw new Error('A deleted project received a new provider reservation');
  }});
  await agent.execute({runId,chatId});assert.equal(blocked,'PROJECT_DELETED');
 }finally{f.db.close()}
});

test('an in-progress reply stays cancelled when its project is restored',async()=>{
 const f=fixture();try{
  const p=await f.create('Requests'),chatId=randomUUID(),runId=randomUUID(),created=new Date().toISOString(),day=created.slice(0,10);
  f.db.prepare('INSERT INTO senda_agent_chats(id,owner,project,created,updated,lock_id,lock_until) VALUES(?,?,?,?,?,?,?)').bind(chatId,f.actor.userId,p.id,created,created,runId,Date.now()+600000).run();
  await reserveTurn(f.db,{runId,chatId,owner:f.actor.userId,day});let blocked;
  const agent=new HostedAgent({DB:f.db},f.projects,origin,{run:async options=>{
   await options.reserveCall('main');await options.settleCall({inputTokens:1000,outputTokens:100});
   await f.projects.delete(f.actor,p.id);await f.projects.restore(f.actor,p.id);
   try{await options.reserveCall('main')}catch(error){blocked=error.code;throw error}
   throw new Error('An earlier reply resumed after restoration');
  }});
  await agent.execute({runId,chatId});assert.equal(blocked,'STALE_PROJECT');
 }finally{f.db.close()}
});

test('deletion and permanent cleanup retain lifetime trial spend and Pro usage across projects',async()=>{
 const f=fixture();try{
  const p=await f.create('Trial project'),other=await f.create('Paid project'),chat=randomUUID(),paidChat=randomUUID(),at='2026-10-31T12:00:00.000Z';
  for(const [id,project] of [[chat,p.id],[paidChat,other.id]])f.db.prepare('INSERT INTO senda_agent_chats(id,owner,project,created,updated) VALUES(?,?,?,?,?)').bind(id,f.actor.userId,project,at,at).run();
  await claimTrial(f.db,f.actor.userId,{id:chat,project:p.id});
  const paid={context:'live',subscriptionId:'sub-paid',periodStart:at,periodEnd:'2026-11-30T12:00:00.000Z',limitUsd:6,dailyUsd:3};
  f.db.prepare("INSERT INTO senda_billing_subscriptions(context,id,owner,status,eligible,period_start,period_end,updated) VALUES('live','sub-paid',?,'active',1,1,9999999999,?)").bind(f.actor.userId,at).run();
  f.db.prepare("INSERT INTO senda_agent_runs(id,chat,owner,day,status,reserved_usd,cost_usd,meter_usd,trial_owner,created,response,progress) VALUES('trial-run',?,?,?,'complete',.12,.12,.12,?,?,?,?)").bind(chat,f.actor.userId,'2026-10-31',f.actor.userId,at,'private reply','private progress').run();
  for(const [id,target,cost] of [['paid-one',chat,.3],['paid-two',paidChat,.4]])f.db.prepare("INSERT INTO senda_agent_runs(id,chat,owner,day,status,reserved_usd,cost_usd,meter_usd,billing_context,billing_subscription,billing_period_start,created) VALUES(?,?,?,?,'complete',?,?,?,'live','sub-paid',?,?)").bind(id,target,f.actor.userId,'2026-10-31',cost,cost,cost,at,at).run();
  const trial=await trialStatus(f.db,f.actor.userId),paidBefore=await paidUsage(f.db,f.actor.userId,paid),grant=f.db.prepare('SELECT * FROM senda_agent_trials').first(),subscription=f.db.prepare('SELECT * FROM senda_billing_subscriptions').first();
  const money=()=>f.db.prepare('SELECT id,chat,owner,status,reserved_usd,cost_usd,meter_usd,trial_owner,billing_context,billing_subscription,billing_period_start FROM senda_agent_runs ORDER BY id').all().results;
  const usageBefore=money();await f.projects.delete(f.actor,p.id);
  assert.deepEqual(money(),usageBefore);assert.deepEqual(await paidUsage(f.db,f.actor.userId,paid),paidBefore);
  f.advance(week);await f.projects.purgeDeleted();
  assert.deepEqual(money(),usageBefore);assert.deepEqual(await trialStatus(f.db,f.actor.userId),trial);assert.deepEqual(await paidUsage(f.db,f.actor.userId,paid),paidBefore);
  assert.deepEqual(f.db.prepare('SELECT * FROM senda_agent_trials').first(),grant);assert.deepEqual(f.db.prepare('SELECT * FROM senda_billing_subscriptions').first(),subscription);
  await assert.rejects(claimTrial(f.db,f.actor.userId,{id:paidChat,project:other.id}),{code:'TRIAL_PROJECT'});
  const privateRun=f.db.prepare("SELECT response,progress FROM senda_agent_runs WHERE id='trial-run'").first();assert.equal(privateRun.response,null);assert.equal(privateRun.progress,null);
 }finally{f.db.close()}
});

test('deleted projects settle abandoned reservations without erasing completed spend or a live lock',async()=>{
 const f=fixture();try{
  const p=await f.create('Requests'),at='2026-10-31T12:00:00.000Z',rows=[['unstarted',0,0,.05],['queued',0,Date.parse('2026-11-01T12:00:00Z'),.05],['unknown',1,0,.2],['active',1,Date.parse('2026-11-01T12:00:00Z'),.1]];
  for(const [id,started,lock,cost] of rows){
   f.db.prepare('INSERT INTO senda_agent_chats(id,owner,project,created,updated,lock_id,lock_until) VALUES(?,?,?,?,?,?,?)').bind(id,f.actor.userId,p.id,at,at,'run-'+id,lock).run();
   f.db.prepare("INSERT INTO senda_agent_runs(id,chat,owner,day,status,reserved_usd,started,trial_owner,created) VALUES(?,?,?,?,'running',?,?,?,?)").bind('run-'+id,id,f.actor.userId,'2026-10-31',cost,started,f.actor.userId,at).run();
  }
  await claimTrial(f.db,f.actor.userId,{id:'unstarted',project:p.id});
  f.db.prepare("INSERT INTO senda_agent_runs(id,chat,owner,day,status,reserved_usd,cost_usd,meter_usd,trial_owner,created) VALUES('completed','unknown',?,?,'complete',.07,.07,.07,?,?)").bind(f.actor.userId,'2026-10-31',f.actor.userId,at).run();
  const complete=f.db.prepare("SELECT * FROM senda_agent_runs WHERE id='completed'").first();
  await f.projects.delete(f.actor,p.id);
  for(const [id,cost] of [['unstarted',0],['queued',0],['unknown',.2]]){const row=f.db.prepare('SELECT * FROM senda_agent_runs WHERE id=?').bind('run-'+id).first();assert.equal(row.status,'failed');assert.equal(row.cost_usd,cost);assert.equal(row.meter_usd,0)}
  assert.equal(f.db.prepare("SELECT lock_id FROM senda_agent_chats WHERE id='queued'").first().lock_id,null);
  assert.equal(f.db.prepare("SELECT status FROM senda_agent_runs WHERE id='run-active'").first().status,'running');
  const before=await trialStatus(f.db,f.actor.userId);
  assert.deepEqual(f.db.prepare("SELECT * FROM senda_agent_runs WHERE id='completed'").first(),complete);
  f.advance(2*86400000);await f.projects.purgeDeleted();
  assert.equal(f.db.prepare("SELECT status FROM senda_agent_runs WHERE id='run-active'").first().status,'failed');
  assert.ok(f.objects.size>0,'Recoverable content remains during the undo window');
  f.advance(week);await f.projects.purgeDeleted();
  const active=f.db.prepare("SELECT * FROM senda_agent_runs WHERE id='run-active'").first();assert.equal(active.status,'failed');assert.equal(active.cost_usd,.1);assert.equal(active.meter_usd,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM senda_agent_runs').first().n,5);
  const after=await trialStatus(f.db,f.actor.userId);assert.equal(after.pendingUsd,0);assert.ok(Math.abs(after.remainingUsd-before.remainingUsd)<1e-9);
  assert.equal(f.db.prepare("SELECT cost_usd FROM senda_agent_runs WHERE id='completed'").first().cost_usd,.07);
 }finally{f.db.close()}
});

async function call(handler,name,args={}){
 const response=await handler.fetch(new Request(origin+'/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}));
 const text=await response.text(),data=text.split('\n').find(l=>l.startsWith('data:')),message=JSON.parse(data?data.slice(5):text);
 return message.result||{isError:true,content:[{type:'text',text:JSON.stringify(message.error)}]};
}

test('MCP delete requires explicit confirmation and write scope, and deleted IDs produce a clear error',async()=>{
 const f=fixture(),handlers=[];try{
  assert.ok(toolDefinitions.find(t=>t.name==='delete_project'));
  const p=await f.create('Requests');await f.projects.grant(f.actor.userId,'analyst',p.id);
  const writer=createAgentHandler(f.projects,{...f.actor,clientId:'analyst',scopes:['projects:read','projects:write']},origin),reader=createAgentHandler(f.projects,{...f.actor,clientId:'analyst',scopes:['projects:read']},origin);handlers.push(writer,reader);
  for(const args of [{projectId:p.id},{projectId:p.id,confirm:false}])assert.equal((await call(writer,'delete_project',args)).isError,true);
  const denied=await call(reader,'delete_project',{projectId:p.id,confirm:true});assert.equal(denied.isError,true);assert.match(denied.content[0].text,/projects:write/);
  assert.equal((await f.projects.list(f.actor)).length,1);
  const removed=await call(writer,'delete_project',{projectId:p.id,confirm:true});assert.ok(!removed.isError);assert.match(removed.content[0].text,/deleted/i);assert.match(removed.content[1].text,/within 7 days/);
  const stale=await call(writer,'read_project',{projectId:p.id,model:'as-is'});assert.equal(stale.isError,true);assert.match(stale.content[0].text,/This project was deleted/);
 }finally{for(const handler of handlers)await handler.close();f.db.close()}
});

test('HTTP deletion validates confirmation and old review, source and download endpoints return not found',async()=>{
 const f=fixture();let app;try{
  const p=await f.create('Requests');app=await createRequestHandler({origin,projects:f.projects,auth:{api:{getSession:async()=>({user:{id:f.actor.userId,email:'owner@example.test'}})}}});
  const request=(url,body)=>app.handle(new Request(origin+url,body?{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}:{}));
  assert.equal((await request(`/api/projects/${p.id}/delete`,{})).status,400);
  assert.equal((await request(`/api/projects/${p.id}/delete`,{confirm:true})).status,200);
  assert.equal((await(await request('/api/projects/deleted')).json())[0].id,p.id);
  for(const endpoint of ['review','bpmn','export-info?revision=1','read','sources','models']){
   const response=await request(`/api/projects/${p.id}/${endpoint}`);assert.equal(response.status,404,endpoint);assert.equal((await response.json()).code,'NOT_FOUND');
  }
  assert.equal((await request(`/api/projects/${p.id}/restore`,{})).status,200);
  assert.equal((await request(`/api/projects/${p.id}/read`)).status,200);
 }finally{await app?.close?.();f.db.close()}
});
