import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { HostedAgent } from '../src/cloudflare/agent.js';
import { reserveTurn } from '../src/cloudflare/agent-budget.js';
import { memoryD1 } from './fixtures/d1.js';

function fixture() {
  const db = memoryD1();
  for (const name of ['0004_hosted_agent.sql', '0006_agent_meter.sql', '0007_agent_workflow.sql', '0008_agent_billing_period.sql', '0009_service_budget.sql'])
    db.exec(readFileSync(new URL('../src/cloudflare/migrations/' + name, import.meta.url), 'utf8'));
  const id = randomUUID(), lock = randomUUID(), now = Date.now();
  db.prepare('INSERT INTO senda_agent_chats(id,owner,created,updated,lock_id,lock_until) VALUES(?,?,?,?,?,?)')
    .bind(id, 'owner', 'fixture', 'fixture', lock, now + 600000 - 45000).run();
  const agent = new HostedAgent({ DB: db }, {}, 'https://senda.example');
  return { db, id, lock, now, agent, row: () => db.prepare('SELECT * FROM senda_agent_chats WHERE id=?').bind(id).first() };
}

test('reload recovers an abandoned admission with no run and preserves saved conversation and usage', async () => {
  const f = fixture();
  try {
    const saved = [{ role: 'user', text: 'Saved interview.' }, { role: 'assistant', text: 'Saved diagram.' }];
    f.db.prepare('UPDATE senda_agent_chats SET display=? WHERE id=?').bind(JSON.stringify(saved), f.id).run();
    const recovered = await f.agent.recover(f.row());
    assert.equal(recovered.lock_id, null, 'An abandoned admission must not disable chat for the ten-minute turn lease');
    assert.equal(recovered.lock_until, 0);
    const display = JSON.parse(recovered.display);
    assert.deepEqual(display.slice(0, saved.length), saved);
    assert.equal(display.at(-1).incomplete, true);
    assert.match(display.at(-1).text, /did not start/);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM senda_agent_runs').first().n, 0);
    assert.deepEqual(await f.agent.recover(recovered), recovered, 'Repeated reloads do not add duplicate notices');
  } finally { f.db.close(); }
});

test('recovery leaves live admission, reserved work and replacement locks alone', async () => {
  for (const scenario of ['recent', 'reserved', 'replacement']) {
    const f = fixture();
    try {
      const original = f.row();
      if (scenario === 'recent') {
        f.db.prepare('UPDATE senda_agent_chats SET lock_until=? WHERE id=?').bind(f.now + 600000, f.id).run();
      } else if (scenario === 'reserved') {
        f.db.prepare("INSERT INTO senda_agent_runs(id,chat,owner,day,status,reserved_usd,created) VALUES(?,?,?,'fixture','running',.05,'fixture')")
          .bind(f.lock, f.id, 'owner').run();
      } else {
        f.db.prepare('UPDATE senda_agent_chats SET lock_id=?,lock_until=? WHERE id=?').bind('replacement', f.now + 600000, f.id).run();
      }
      const expected = f.row();
      await f.agent.recover(scenario === 'replacement' ? original : expected);
      assert.deepEqual(f.row(), expected, scenario);
    } finally { f.db.close(); }
  }
});

test('a disconnected turn retains admission until it has queued exactly one durable run', async () => {
  const f = fixture(), retained = [], abort = new AbortController();
  try {
    f.db.prepare('UPDATE senda_agent_chats SET lock_id=NULL,lock_until=0').run();
    let agent, calls = 0;
    agent = new HostedAgent({ DB: f.db, OPENAI_API_KEY: 'fixture', AGENT_ALLOWED_EMAILS: 'owner@example.test' }, {}, 'https://senda.example', {
      waitUntil: promise => retained.push(promise),
      dispatch: params => agent.execute(params),
      run: async () => { calls++; return { text: 'Saved reply.', messages: [], usage: { inputTokens: 0, outputTokens: 0 } }; },
    });
    const response = agent.handle(new Request(`https://senda.example/api/agent/chats/${f.id}/turn`, {
      method: 'POST', signal: abort.signal, body: JSON.stringify({ requestId: randomUUID(), text: 'Summarize the process.' }),
    }), { userId: 'owner' }, 'owner@example.test');
    abort.abort();
    await (await response).text();
    assert.equal(retained.length, 1, 'Worker admission must outlive its disconnected request');
    assert.deepEqual(await Promise.all(retained), [undefined], 'The lifetime task retains neither response bodies nor private messages');
    assert.equal(calls, 1);
    assert.equal(f.row().lock_id, null);
    assert.equal(f.db.prepare('SELECT status FROM senda_agent_runs').first().status, 'complete');
  } finally { f.db.close(); }
});

test('an admission that lost its lock cannot later reserve allowance or start a run', async () => {
  const f = fixture();
  try {
    f.db.prepare('UPDATE senda_agent_chats SET lock_id=NULL,lock_until=0').run();
    await assert.rejects(reserveTurn(f.db, {
      runId: f.lock, chatId: f.id, owner: 'owner', day: new Date().toISOString().slice(0, 10), lockId: f.lock,
    }), { code: 'LIMIT' });
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM senda_agent_runs').first().n, 0);
  } finally { f.db.close(); }
});
