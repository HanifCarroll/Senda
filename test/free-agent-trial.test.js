import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {memoryD1} from './fixtures/d1.js';
import {CloudProjects} from '../src/cloudflare/projects.js';
import {HostedAgent} from '../src/cloudflare/agent.js';
import {CallBudget,reserveTurn} from '../src/cloudflare/agent-budget.js';
import {claimTrial} from '../src/cloudflare/agent-trial.js';

function fixture({hold=false}={}){
 const db=memoryD1();
 for(const name of readdirSync(new URL('../src/cloudflare/migrations/',import.meta.url)).sort())db.exec(readFileSync(new URL('../src/cloudflare/migrations/'+name,import.meta.url),'utf8'));
 const objects=new Map(),bucket={put:async(k,v)=>objects.set(k,v),delete:async k=>objects.delete(k),get:async k=>objects.has(k)?{text:async()=>objects.get(k)}:null};
 const projects=new CloudProjects(db,bucket,{projectLimit:async()=>3}),actor={userId:'trial-owner'},origin='https://senda.example';
 const env={DB:db,OPENAI_API_KEY:'fixture-not-a-key',FREE_AGENT_TRIAL_ENABLED:'1'};
 let calls=0,agent;
 agent=new HostedAgent(env,projects,origin,{pollMs:1,billing:{entitlement:async()=>null,reviewHold:async()=>hold},dispatch:async params=>{void agent.execute(params)},run:async options=>{
  calls++;await options.reserveCall('main');await options.settleCall({inputTokens:1000,outputTokens:100});
  let projectId=options.projectId;
  if(!projectId){projectId=(await projects.create(actor,{name:'Repairs',purpose:'Map requests',perspective:'Coordinator'})).id;await options.onProject(projectId)}
  return{text:'Saved the process.',messages:[],projectId,model:'as-is',usage:{inputTokens:1000,outputTokens:100}};
 }});
 const request=(path,body)=>agent.handle(new Request(origin+path,body===undefined?{}:{method:'POST',body:JSON.stringify(body)}),actor,'trial@example.test');
 const chat=async projectId=>(await (await request('/api/agent/chats',projectId?{projectId}:{})).json()).id;
 const turn=async id=>{const r=await request(`/api/agent/chats/${id}/turn`,{requestId:randomUUID(),text:'Please map our repair requests.'});return(await r.text()).trim().split('\n').map(JSON.parse)};
 return{db,projects,actor,env,agent,request,chat,turn,get calls(){return calls}};
}

test('an authenticated free account can try Luna without a payment card or an operator allowlist',async()=>{
 const f=fixture();try{
  const config=await(await f.request('/api/agent/config')).json();
  assert.equal(config.available,true);assert.equal(config.trial.limitUsd,.5);assert.equal(config.trial.projectId,null);
  const id=await f.chat();assert.equal((await f.turn(id)).at(-1).type,'done');
  const grant=f.db.prepare('SELECT * FROM senda_agent_trials').first();assert.equal(grant.owner,f.actor.userId);assert.equal(grant.chat,id);assert.ok(grant.project);
  const run=f.db.prepare('SELECT * FROM senda_agent_runs').first();assert.equal(run.trial_owner,f.actor.userId);assert.equal(run.billing_subscription,null);assert.ok(run.cost_usd>0);
  assert.equal((await f.turn(id)).at(-1).type,'done');assert.equal(f.calls,2);
  assert.equal((await f.projects.list(f.actor)).length,1);
 }finally{f.db.close()}
});

test('racing first conversations can claim only one trial project and a new conversation cannot reset it',async()=>{
 const f=fixture();try{
  const ids=await Promise.all([f.chat(),f.chat()]);
  const turns=await Promise.allSettled(ids.map(id=>f.turn(id)));
  assert.equal(turns.filter(t=>t.status==='fulfilled').length,1);assert.equal(f.calls,1);
  assert.equal((await f.projects.list(f.actor)).length,1);
  const grant=f.db.prepare('SELECT * FROM senda_agent_trials').first();
  const same=await(await f.request('/api/agent/chats',{projectId:grant.project,newConversation:true})).json();
  assert.equal((await f.turn(same.id)).at(-1).type,'done');
  const other=await f.projects.create(f.actor,{name:'Another',purpose:'Another process',perspective:'Owner'});
  const denied=await(await f.request('/api/agent/config?project='+other.id)).json();assert.equal(denied.available,false);assert.equal(denied.trial.projectId,grant.project);
  await assert.rejects(f.chat(other.id),{code:'TRIAL_PROJECT'});assert.equal(f.calls,2);
 }finally{f.db.close()}
});

test('a full workspace keeps its trial unclaimed and can choose an existing project',async()=>{
 const f=fixture();try{
  const projectless=await f.chat();
  const projects=[];
  for(let i=0;i<3;i++)projects.push(await f.projects.create(f.actor,{name:'Existing '+i,purpose:'Map requests',perspective:'Coordinator'}));
  const config=await(await f.request('/api/agent/config')).json();
  assert.equal(config.available,false);assert.match(config.message,/existing project/i);
  await assert.rejects(f.chat(),{code:'PROJECT_LIMIT'});
  await assert.rejects(f.turn(projectless),{code:'PROJECT_LIMIT'});
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM senda_agent_trials').first().n,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM senda_agent_runs').first().n,0);
  assert.equal(f.calls,0);
  assert.equal((await(await f.request('/api/agent/config?project='+projects[0].id)).json()).available,true);
  await f.turn(await f.chat(projects[0].id));
  assert.equal(f.calls,1);
  assert.equal(f.db.prepare('SELECT project FROM senda_agent_trials').first().project,projects[0].id);
 }finally{f.db.close()}
});

test('an uncreated trial can recover onto an existing project after a quota race, retaining usage and excluding active replies',async()=>{
 const f=fixture();try{
  const existing=await f.projects.create(f.actor,{name:'Existing',purpose:'Map requests',perspective:'Coordinator'});
  await f.projects.create(f.actor,{name:'Second',purpose:'Map requests',perspective:'Coordinator'});
  const original=await f.chat();
  const normalRun=f.agent.run;
  f.agent.run=async options=>{
   await options.reserveCall('main');await options.settleCall({inputTokens:1000,outputTokens:100});
   await f.projects.create(f.actor,{name:'Concurrent last slot',purpose:'Map requests',perspective:'Coordinator'});
   await f.projects.create(f.actor,{name:'Trial attempt',purpose:'Map requests',perspective:'Coordinator'});
  };
  assert.equal((await f.turn(original)).at(-1).type,'error');
  const before=f.db.prepare('SELECT * FROM senda_agent_trials').first();assert.equal(before.project,null);
  const usage=f.db.prepare('SELECT cost_usd FROM senda_agent_runs').first().cost_usd;assert.ok(usage>0);
  const target=await f.chat(existing.id),held=randomUUID(),day=new Date().toISOString().slice(0,10);
  await reserveTurn(f.db,{runId:held,chatId:original,owner:f.actor.userId,day,entitlement:{kind:'trial',limitUsd:.5,dailyUsd:.5}});
  f.db.prepare('UPDATE senda_agent_chats SET lock_id=? WHERE id=?').bind('recovery-lock',target).run();
  await assert.rejects(claimTrial(f.db,f.actor.userId,f.db.prepare('SELECT * FROM senda_agent_chats WHERE id=?').bind(target).first()),{code:'CONFLICT'});
  assert.deepEqual(f.db.prepare('SELECT * FROM senda_agent_trials').first(),before);
  f.db.prepare("UPDATE senda_agent_runs SET status='failed',cost_usd=0 WHERE id=?").bind(held).run();
  f.agent.run=normalRun;await f.turn(target);
  const after=f.db.prepare('SELECT * FROM senda_agent_trials').first();assert.equal(after.project,existing.id);assert.equal(after.created,before.created);assert.equal(after.limit_usd,before.limit_usd);
  assert.equal(f.db.prepare('SELECT cost_usd FROM senda_agent_runs ORDER BY created LIMIT 1').first().cost_usd,usage);
  assert.equal((await(await f.request('/api/agent/chats/'+original)).json()).messages.length,2);
  const other=(await f.projects.list(f.actor)).find(p=>p.id!==existing.id);await assert.rejects(f.chat(other.id),{code:'TRIAL_PROJECT'});
 }finally{f.db.close()}
});

test('trial spending is lifetime, counts failed and unknown calls, and preserves saved work after exhaustion',async()=>{
 const f=fixture();try{
  const id=await f.chat();await f.turn(id);const grant=f.db.prepare('SELECT * FROM senda_agent_trials').first();
  f.db.prepare("UPDATE senda_agent_runs SET day='2020-01-01',service_day='2020-01-01',status='failed',cost_usd=NULL,reserved_usd=.49").run();
  const config=await(await f.request('/api/agent/config')).json();assert.equal(config.available,false);assert.ok(config.trial.remainingUsd<.02);
  await assert.rejects(f.turn(id),{code:'FORBIDDEN'});assert.equal(f.calls,1);
  const loaded=await(await f.request('/api/agent/chats/'+id)).json();assert.equal(loaded.messages.length,2);
  const current=await f.projects.read(f.actor,grant.project);assert.equal(current.history.length,1);
  await f.projects.apply(f.actor,grant.project,{expectedRevision:1,summary:'Continue with own agent',context:{purpose:'Review requests'}});
  assert.equal((await f.projects.read(f.actor,grant.project)).history.length,2);
 }finally{f.db.close()}
});

test('each trial model call rechecks the lifetime cap and immutable selected project before dispatch',async()=>{
 const f=fixture();try{
  const chat=await f.chat();await f.turn(chat);
  f.db.prepare('UPDATE senda_agent_runs SET cost_usd=.39').run();
  const day=new Date().toISOString().slice(0,10),entitlement={kind:'trial',limitUsd:.5,dailyUsd:.5};
  await reserveTurn(f.db,{runId:'held',chatId:chat,owner:f.actor.userId,day,entitlement});
  const budget=new CallBudget(f.db,{runId:'held',owner:f.actor.userId,day,entitlement});
  await budget.reserve('main');await budget.failure(new Error('unknown provider outcome'));
  await budget.reserve('main');await budget.failure(new Error('unknown provider outcome'));
  await assert.rejects(budget.reserve('review'),{code:'LIMIT'});assert.equal(budget.active,0);
  const other=await f.projects.create(f.actor,{name:'Other',purpose:'Other requests',perspective:'Coordinator'});
  f.db.prepare('UPDATE senda_agent_chats SET project=? WHERE id=?').bind(other.id,chat).run();
  await assert.rejects(new CallBudget(f.db,{runId:'held',owner:f.actor.userId,day,entitlement}).reserve('main'),{code:'LIMIT'});
 }finally{f.db.close()}
});

test('a payment review hold cannot be bypassed with a free trial, and key or workflow absence keeps it off',async()=>{
 const held=fixture({hold:true});try{assert.equal((await(await held.request('/api/agent/config')).json()).available,false);await assert.rejects(held.chat(),{code:'FORBIDDEN'});assert.equal(held.calls,0)}finally{held.db.close()}
 for(const missing of ['OPENAI_API_KEY','dispatch']){const f=fixture();try{if(missing==='dispatch')f.agent.dispatch=undefined;else delete f.env.OPENAI_API_KEY;assert.equal((await(await f.request('/api/agent/config')).json()).available,false);assert.equal(f.calls,0)}finally{f.db.close()}}
});

test('upgrading uses the paid meter across projects and a later lapse does not reset the lifetime trial',async()=>{
 const f=fixture();try{
  const original=await f.chat();await f.turn(original);
  const before=f.db.prepare('SELECT * FROM senda_agent_trials').first(),now=Math.floor(Date.now()/1000);
  f.db.prepare("INSERT INTO senda_billing_subscriptions(context,id,owner,status,eligible,period_start,period_end,updated) VALUES('live','sub-paid',?,'active',1,?,?,?)")
   .bind(f.actor.userId,now-100,now+10000,new Date().toISOString()).run();
  const paid={context:'live',subscriptionId:'sub-paid',periodStart:new Date((now-100)*1000).toISOString(),periodEnd:new Date((now+10000)*1000).toISOString(),limitUsd:6,dailyUsd:3};
  f.agent.billing.entitlement=async()=>paid;
  assert.equal((await(await f.request('/api/agent/config')).json()).trial,undefined);
  const second=await f.projects.create(f.actor,{name:'Deliveries',purpose:'Map delivery',perspective:'Coordinator'});
  await f.turn(await f.chat(second.id));
  const runs=f.db.prepare('SELECT trial_owner,billing_subscription FROM senda_agent_runs ORDER BY created').all().results;
  assert.equal(runs.filter(r=>r.trial_owner===f.actor.userId).length,1);assert.equal(runs.filter(r=>r.billing_subscription==='sub-paid').length,1);
  f.agent.billing.entitlement=async()=>null;f.db.prepare("UPDATE senda_billing_subscriptions SET eligible=0,status='canceled'").run();
  assert.deepEqual(f.db.prepare('SELECT * FROM senda_agent_trials').first(),before);
  await assert.rejects(f.chat(second.id),{code:'TRIAL_PROJECT'});
  await f.turn(original);assert.equal(f.calls,3);
 }finally{f.db.close()}
});
