import test from 'node:test';
import assert from 'node:assert/strict';
import { createActor, toPromise } from 'xstate';
import { createCheckoutMachine } from '../src/server/billing/checkout-machine.js';

function fixture(overrides = {}) {
  const calls = [];
  const services = Object.fromEntries(Object.entries({
    checkHold: undefined, resolveCustomer: undefined, checkSubscriptions: undefined,
    readSession: { exists: false }, rotateAttempt: undefined,
    createSession: { url: 'https://checkout.stripe.com/new' }, ...overrides,
  }).map(([name, value]) => [name, async () => {
    calls.push(name);
    if (value instanceof Error) throw value;
    return typeof value === 'function' ? value() : value;
  }]));
  const actor = createActor(createCheckoutMachine(services));
  return { actor, calls, result: () => { const result = toPromise(actor); actor.start(); return result; } };
}

test('a new Checkout verifies hold, customer and subscriptions before opening a session', async () => {
  const f = fixture();
  assert.deepEqual(await f.result(), { result: { url: 'https://checkout.stripe.com/new' }, error: null });
  assert.deepEqual(f.calls, ['checkHold', 'resolveCustomer', 'checkSubscriptions', 'readSession', 'createSession']);
});

test('an open Checkout returns its existing URL without rotating the attempt or creating another session', async () => {
  const f = fixture({ readSession: { exists: true, url: 'https://checkout.stripe.com/existing' } });
  assert.equal((await f.result()).result.url, 'https://checkout.stripe.com/existing');
  assert.deepEqual(f.calls, ['checkHold', 'resolveCustomer', 'checkSubscriptions', 'readSession']);
});

test('a closed Checkout rotates the idempotent attempt before creating its replacement', async () => {
  const f = fixture({ readSession: { exists: true } });
  await f.result();
  assert.deepEqual(f.calls.slice(-3), ['readSession', 'rotateAttempt', 'createSession']);
});

for (const boundary of ['checkHold', 'resolveCustomer', 'checkSubscriptions', 'readSession', 'rotateAttempt', 'createSession']) {
  test(`Checkout stops after ${boundary} fails and does not retry an external operation`, async () => {
    const error = new Error('fixture failure');
    const f = fixture({ readSession: { exists: true }, [boundary]: error });
    const output = await f.result();
    assert.equal(output.error, error);
    assert.equal(output.result, null);
    assert.equal(f.calls.at(-1), boundary);
    assert.equal(f.calls.filter(name => name === boundary).length, 1);
  });
}

test('Checkout waits for the canonical subscription check before any session read or write', async () => {
  let resolve;
  const check = new Promise(done => { resolve = done; });
  const f = fixture({ checkSubscriptions: () => check });
  const result = f.result();
  await new Promise(done => setImmediate(done));
  assert.equal(f.actor.getSnapshot().value, 'checkingSubscriptions');
  assert.deepEqual(f.calls, ['checkHold', 'resolveCustomer', 'checkSubscriptions']);
  resolve();
  await result;
  assert.equal(f.calls.at(-1), 'createSession');
});
