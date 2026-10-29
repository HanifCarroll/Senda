import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { memoryD1 } from './fixtures/d1.js';
import { CloudProjects } from '../src/cloudflare/projects.js';
import { CloudBilling, billingConfig } from '../src/cloudflare/billing.js';
import { HostedAgent } from '../src/cloudflare/agent.js';
import { OperationalAlerts } from '../src/cloudflare/operations.js';
import { reserveTurn, CallBudget, serviceUsage, budgetPause } from '../src/cloudflare/agent-budget.js';
import { billingNow, emailListed } from '../src/server/billing/plan.js';

function database() {
  const db = memoryD1();
  for (const name of ['0002_projects.sql','0004_hosted_agent.sql','0005_billing.sql','0006_agent_meter.sql','0007_agent_workflow.sql','0008_agent_billing_period.sql','0009_service_budget.sql'])
    db.exec(readFileSync(new URL('../src/cloudflare/migrations/' + name, import.meta.url), 'utf8'));
  return db;
}
const day = new Date().toISOString().slice(0, 10);
const monthStart = day.slice(0, 7) + '-01';
function spend(db, id, amount, { owner = id, date = day, status = 'complete', known = true } = {}) {
  db.prepare('INSERT INTO senda_agent_runs(id,chat,owner,day,service_day,status,reserved_usd,cost_usd,created) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(id, 'chat', owner, date, date, status, amount, known ? amount : null, new Date().toISOString()).run();
}
function entitlement(db, owner, { start = Math.floor(Date.now()/1000)-100, end = start+10000 } = {}) {
  db.prepare("INSERT INTO senda_billing_subscriptions(context,id,owner,status,eligible,period_start,period_end,updated) VALUES('sandbox',?,?,'active',1,?,?,?)")
    .bind('sub-'+owner, owner, start, end, new Date().toISOString()).run();
  return { context:'sandbox',subscriptionId:'sub-'+owner,periodStart:new Date(start*1000).toISOString(),periodEnd:new Date(end*1000).toISOString(),limitUsd:6,dailyUsd:3 };
}

test('aggregate admission includes operators and prevents concurrent accounts from exceeding the shared cap', async () => {
  const db = database();
  try {
    spend(db,'operator',9.8);
    const attempts = await Promise.allSettled(['one','two'].map(owner => reserveTurn(db,{runId:owner,chatId:'chat',owner,day})));
    assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(attempts.filter(r=>r.status==='rejected'&&r.reason.code==='LIMIT').length,1);
    assert.ok((await serviceUsage(db)).dailyUsd <= 10);
  } finally { db.close(); }
});

test('unknown failed-call reservations still block the monthly service budget', async () => {
  const db = database();
  try {
    spend(db,'uncertain',99.9,{date:monthStart,status:'failed',known:false});
    await assert.rejects(reserveTurn(db,{runId:'new',chatId:'chat',owner:'new',day}),{code:'LIMIT'});
    assert.equal((await budgetPause(db,'new',day)).reason,'capacity');
  } finally { db.close(); }
});

test('a turn crossing the UTC service window conservatively moves all reserved work before another call', async () => {
  const db = database();
  try {
    const yesterday = new Date(Date.parse(day+'T00:00:00Z')-86400000).toISOString().slice(0,10);
    spend(db,'today',9.2);
    spend(db,'old',.8,{owner:'owner',date:yesterday,status:'running',known:false});
    const budget = new CallBudget(db,{runId:'old',owner:'owner',day:yesterday});
    await budget.reserve('main');
    await budget.failure(new Error('Unknown provider outcome'));
    assert.equal(db.prepare("SELECT service_day FROM senda_agent_runs WHERE id='old'").first().service_day,day);
    await assert.rejects(budget.reserve('review'),{code:'LIMIT'});
    assert.ok(Math.abs((await serviceUsage(db)).dailyUsd-10)<1e-9);
  } finally { db.close(); }
});

test('paid daily capacity can be three dollars while operator preview remains at two', async () => {
  const db = database();
  try {
    const e=entitlement(db,'paid');spend(db,'paid-spend',2.5,{owner:'paid'});
    await reserveTurn(db,{runId:'paid-new',chatId:'chat',owner:'paid',day,entitlement:e});
    spend(db,'operator-spend',2,{owner:'operator'});
    await assert.rejects(reserveTurn(db,{runId:'operator-new',chatId:'chat',owner:'operator',day}),{code:'LIMIT'});
  } finally { db.close(); }
});

test('a sandbox clock can qualify a future Stripe period, and live mode always ignores it', async () => {
  const db=database();
  const base={DB:db,BILLING_ENABLED:'1',PAID_AGENT_ENABLED:'1',STRIPE_LIVEMODE:'false',STRIPE_ACCOUNT_ID:'acct_1TX0nqK7alsSe3q5',STRIPE_SECRET_KEY:'fixture',STRIPE_WEBHOOK_SECRET:'fixture',STRIPE_PRICE_ID:'price_fixture',BILLING_INCLUDED_USD:'6',BILLING_SANDBOX_CLOCK_OFFSET_SECONDS:'2592000'};
  try {
    const future=Math.floor(Date.now()/1000)+2592000,e=entitlement(db,'future',{start:future-60,end:future+86400});
    db.prepare("UPDATE senda_billing_subscriptions SET context=?").bind(base.STRIPE_ACCOUNT_ID+':sandbox').run();
    const qa=new CloudBilling(base,'https://qa.example',{client:{}});
    assert.ok(await qa.entitlement({userId:'future'}));
    e.context=base.STRIPE_ACCOUNT_ID+':sandbox';
    await reserveTurn(db,{runId:'future-ok',chatId:'chat',owner:'future',day,entitlement:e,nowMs:billingNow(base)});
    await assert.rejects(reserveTurn(db,{runId:'future-wall-clock',chatId:'chat',owner:'future',day,entitlement:e}),{code:'LIMIT'});
    assert.equal(billingNow({...base,STRIPE_LIVEMODE:'true'},1000),1000);
    assert.equal(emailListed('', ''),false);
  } finally { db.close(); }
});

test('parallel project creation enforces the owner quota atomically without publishing orphan models or grants', async () => {
  const db=database(),objects=new Map();
  const bucket={put:async(k,v)=>objects.set(k,v),delete:async k=>objects.delete(k),get:async k=>objects.has(k)?{text:async()=>objects.get(k)}:null};
  let limit=3;
  const projects=new CloudProjects(db,bucket,{projectLimit:async()=>limit}),actor={userId:'owner',clientId:'client'};
  try {
    const results=await Promise.allSettled(Array.from({length:12},()=>projects.create(actor,{name:'Intake',purpose:'Map intake',perspective:'Coordinator'})));
    const created=results.filter(r=>r.status==='fulfilled');assert.equal(created.length,3);
    assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='PROJECT_LIMIT').length,9);
    for(const table of ['senda_projects','senda_models','senda_revisions','senda_grants'])assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first().count,3);
    assert.equal(objects.size,3);
    limit=1;
    const id=created[0].value.id;
    assert.equal((await projects.read(actor,id)).history.length,1);
    await projects.apply(actor,id,{expectedRevision:1,summary:'Retain editing after a lapse',context:{purpose:'Map intake with the coordinator'}});
    assert.equal((await projects.read(actor,id)).history.length,2);
    await assert.rejects(projects.create(actor,{name:'Another',purpose:'New work',perspective:'Coordinator'}),{code:'PROJECT_LIMIT'});
    assert.equal((await projects.list(actor)).length,3);
  } finally { db.close(); }
});

test('operator emails are deduplicated, include aggregate capacity and growth, and never retry uncertain delivery', async () => {
  const db=database(),sent=[];
  const env={DB:db,STRIPE_LIVEMODE:'false',STRIPE_ACCOUNT_ID:'acct_1TX0nqK7alsSe3q5',AGENT_ALLOWED_EMAILS:'owner@example.test',BILLING_OPERATOR_EMAIL:'owner@example.test',EMAIL:{send:async m=>sent.push(m)}};
  const alerts=new OperationalAlerts(env);
  try {
    spend(db,'capacity',60);
    for(let n=0;n<14;n++){
      entitlement(db,'payer-'+n);
    }
    db.prepare("UPDATE senda_billing_subscriptions SET context=?").bind(env.STRIPE_ACCOUNT_ID+':sandbox').run();
    await alerts.observe();await alerts.observe();
    assert.equal(sent.length,3);
    assert.ok(sent.every(m=>m.to==='owner@example.test'&&!m.text.includes('payer-')));
    env.EMAIL.send=async()=>{throw new Error('Uncertain email delivery');};
    await alerts.notify('uncertain-alert','test','A delivery test.');
    assert.equal(db.prepare("SELECT status FROM senda_operational_alerts WHERE id='uncertain-alert'").first().status,'unknown');
    await alerts.notify('uncertain-alert','test','Do not send this again.');
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM senda_operational_alerts').first().count,4);
  } finally { db.close(); }
});

test('a QA paid allowlist cannot be bypassed by buying a sandbox subscription, while production uses the paid entitlement', async () => {
  let reads=0;
  const env={DB:{},DEEPSEEK_API_KEY:'fixture',AGENT_WORKFLOW:{},PAID_AGENT_ALLOWED_EMAILS:'qa@example.test'};
  const billing={entitlement:async()=>{reads++;return{subscriptionId:'sub'};}};
  const check=async(email,settings=env)=>new HostedAgent(settings,{},'https://qa.example',{billing}).handle(new Request('https://qa.example/api/agent/config'),{userId:'owner'},email).then(r=>r.json());
  assert.equal((await check('stranger@example.test')).available,false);assert.equal(reads,0);
  assert.equal((await check('qa@example.test')).available,true);
  assert.equal((await check('customer@example.test',{...env,PAID_AGENT_ALLOWED_EMAILS:undefined})).available,true);
  billing.entitlement=async()=>null;
  assert.equal((await check('customer@example.test',{...env,PAID_AGENT_ALLOWED_EMAILS:undefined})).available,false);
});

test('live checkout refuses a mismatched commercial price, allowance or notification account', async () => {
  const env={BILLING_ENABLED:'1',PAID_AGENT_ENABLED:'1',STRIPE_LIVEMODE:'true',STRIPE_ACCOUNT_ID:'acct_1TX0nfGSlAkX1ZYL',STRIPE_SECRET_KEY:'fixture',STRIPE_WEBHOOK_SECRET:'fixture',STRIPE_PRICE_ID:'price_fixture',BILLING_INCLUDED_USD:'6',AGENT_ALLOWED_EMAILS:'operator@example.test',BILLING_OPERATOR_EMAIL:'operator@example.test'};
  assert.equal(billingConfig(env).configured,true);
  for(const change of [{BILLING_INCLUDED_USD:'3'},{BILLING_OPERATOR_EMAIL:'stranger@example.test'},{AGENT_ALLOWED_EMAILS:''}])assert.equal(billingConfig({...env,...change}).configured,false);
  const price={livemode:true,active:true,type:'recurring',currency:'usd',unit_amount:2900,recurring:{interval:'month',interval_count:1}},client={accounts:{retrieve:async()=>({id:env.STRIPE_ACCOUNT_ID})},prices:{retrieve:async()=>price}};
  const billing=new CloudBilling(env,'https://senda.example',{client});
  assert.equal((await billing.verifyCatalog({forCheckout:true})).unit_amount,2900);
  price.unit_amount=1500;
  await assert.rejects(billing.verifyCatalog({forCheckout:true}),{code:'BILLING_UNAVAILABLE'});
  price.unit_amount=2900;price.active=false;
  await assert.rejects(billing.verifyCatalog({forCheckout:true}),{code:'BILLING_UNAVAILABLE'});
  assert.equal((await billing.verifyCatalog()).unit_amount,2900,'Existing paid accounts can manage a retired price');
});

test('a canceled future sandbox record cannot hide a currently valid paid subscription or its workspace limit', async () => {
  const db=database();
  try {
    const start=Math.floor(Date.now()/1000)-60,end=start+86400,context='acct_1TX0nqK7alsSe3q5:sandbox';
    entitlement(db,'owner',{start,end});
    db.prepare('UPDATE senda_billing_subscriptions SET context=?').bind(context).run();
    db.prepare("INSERT INTO senda_billing_subscriptions(context,id,owner,status,eligible,period_start,period_end,updated) VALUES(?,'sub-old-clock','owner','canceled',0,?,?,?)").bind(context,end+86400,end+172800,new Date().toISOString()).run();
    const env={DB:db,BILLING_ENABLED:'1',PAID_AGENT_ENABLED:'1',STRIPE_LIVEMODE:'false',STRIPE_ACCOUNT_ID:'acct_1TX0nqK7alsSe3q5',STRIPE_SECRET_KEY:'fixture',STRIPE_WEBHOOK_SECRET:'fixture',STRIPE_PRICE_ID:'price_fixture',BILLING_INCLUDED_USD:'6'};
    const client={accounts:{retrieve:async()=>({id:env.STRIPE_ACCOUNT_ID})},prices:{retrieve:async()=>({livemode:false,type:'recurring',currency:'usd',unit_amount:100,recurring:{interval:'month',interval_count:1}})}};
    const billing=new CloudBilling(env,'https://qa.example',{client}),status=await billing.status({userId:'owner'});
    assert.equal(status.subscription.active,true);assert.equal(status.subscription.periodEnd,new Date(end*1000).toISOString());assert.equal(status.projectLimit,100);
    assert.equal(await billing.workspaceLimit({userId:'free'}),3);
    db.prepare("UPDATE senda_billing_subscriptions SET eligible=0 WHERE id='sub-owner'").run();
    assert.equal(await billing.workspaceLimit({userId:'owner'}),3,'A lapse changes only the creation allowance');
  } finally {db.close();}
});
