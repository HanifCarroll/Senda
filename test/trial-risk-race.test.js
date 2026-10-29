import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {memoryD1} from './fixtures/d1.js';
import {claimTrial} from '../src/cloudflare/agent-trial.js';
import {CallBudget,reserveTurn} from '../src/cloudflare/agent-budget.js';

test('a payment review appearing after trial admission blocks the next call with allowance remaining',async()=>{
 const db=memoryD1();
 for(const name of readdirSync(new URL('../src/cloudflare/migrations/',import.meta.url)).sort())db.exec(readFileSync(new URL('../src/cloudflare/migrations/'+name,import.meta.url),'utf8'));
 const owner='trial-owner',chatId='trial-chat',project='trial-project',day=new Date().toISOString().slice(0,10),now=Math.floor(Date.now()/1000);
 try{
  db.prepare('INSERT INTO senda_agent_chats(id,owner,project,created,updated) VALUES(?,?,?,?,?)').bind(chatId,owner,project,new Date().toISOString(),new Date().toISOString()).run();
  const entitlement=await claimTrial(db,owner,{id:chatId,project});
  await reserveTurn(db,{runId:'trial-run',chatId,owner,day,entitlement});
  const budget=new CallBudget(db,{runId:'trial-run',owner,day,entitlement});
  await budget.reserve('main');await budget.settle({inputTokens:1000,outputTokens:100});
  const before=db.prepare("SELECT reserved_usd FROM senda_agent_runs WHERE id='trial-run'").first().reserved_usd;
  assert.ok(entitlement.limitUsd-before>.4);
  db.prepare("INSERT INTO senda_billing_subscriptions(context,id,owner,status,eligible,period_start,period_end,updated) VALUES('live','subscription',?,'active',1,?,?,?)").bind(owner,now-100,now+10000,new Date().toISOString()).run();
  db.prepare("INSERT INTO senda_billing_risks VALUES('live','subscription','dispute','dispute',1)").run();
  await assert.rejects(budget.reserve('main'),{code:'LIMIT'});
  assert.equal(budget.active,0);
  assert.equal(db.prepare("SELECT reserved_usd FROM senda_agent_runs WHERE id='trial-run'").first().reserved_usd,before);
 }finally{db.close()}
});
