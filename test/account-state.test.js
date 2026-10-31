import test from 'node:test';
import assert from 'node:assert/strict';
import { createActor, SimulatedClock, transition } from 'xstate';
import {
  createSignInMachine, createPasswordMachine, createConsentMachine,
  createConnectionMachine, createBillingMachine,
} from '../src/web/lib/account-machines.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const location = () => ({ origin: 'https://senda.example', search: '?plan=pro' });
const start = (machine, options) => createActor(machine, options).start();

test('email sign-in blocks requests before capabilities and serializes sends while retaining continuation', async () => {
  const config = deferred(), delivery = deferred(), calls = [];
  const actor = start(createSignInMachine({
    load: () => config.promise, location, navigate: () => {},
    magicLink: input => { calls.push(input); return delivery.promise; }, social: async () => ({}),
  }));
  actor.send({ type: 'SEND', email: ' a@example.test ' });
  assert.equal(calls.length, 0);
  actor.send({ type: 'START', issue: 'TOKEN_EXPIRED' });
  assert.match(actor.getSnapshot().context.error, /expired/);
  config.resolve({ loginMethods: { magicLink: true, google: true, password: false } });
  await tick();
  actor.send({ type: 'SEND', email: ' a@example.test ' });
  actor.send({ type: 'SEND', email: ' a@example.test ' });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    email: 'a@example.test', callbackURL: 'https://senda.example/app/billing',
    errorCallbackURL: 'https://senda.example/sign-in?plan=pro',
  });
  assert.equal(actor.getSnapshot().hasTag('busy'), true);
  delivery.resolve({});
  await tick();
  assert.equal(actor.getSnapshot().hasTag('sent'), true);
  actor.send({ type: 'EDIT' });
  assert.equal(actor.getSnapshot().hasTag('sent'), false);
  actor.stop();
});

test('password modes are exclusive, registration requires verification, and reset and resend recover from errors', async () => {
  const calls = [], navigation = [], request = deferred();
  const actor = start(createPasswordMachine({
    load: async () => ({ accountEmail: true }), location, navigate: url => navigation.push(url),
    signUp: async input => { calls.push(['signup', input]); return { data: {} }; },
    signIn: async input => { calls.push(['signin', input]); return { data: { token: 'fixture' } }; },
    reset: async input => { calls.push(['reset', input]); return request.promise; },
    verify: async input => { calls.push(['verify', input]); return { error: { message: 'Wait before resending.' } }; },
  }));
  const data = { email: 'a@example.test', password: 'fixture-password', name: 'A' };
  actor.send({ type: 'SUBMIT', data });
  assert.equal(calls.length, 0);
  actor.send({ type: 'START' });
  await tick();
  actor.send({ type: 'TOGGLE_ACCOUNT' });
  assert.equal(actor.getSnapshot().matches({ ready: { form: 'register' } }), true);
  actor.send({ type: 'SUBMIT', data });
  await tick();
  assert.equal(actor.getSnapshot().matches({ ready: { form: { signIn: 'verification' } } }), true);
  assert.equal(actor.getSnapshot().context.verifyEmail, data.email);
  assert.match(actor.getSnapshot().context.notice, /verification link/);
  assert.equal(calls[0][1].callbackURL, 'https://senda.example/sign-in?plan=pro');
  actor.send({ type: 'RESEND' });
  await tick();
  assert.equal(actor.getSnapshot().context.error, 'Wait before resending.');
  assert.equal(calls[1][1].callbackURL, 'https://senda.example/sign-in?plan=pro');
  actor.send({ type: 'RESET' });
  actor.send({ type: 'SUBMIT', data });
  actor.send({ type: 'TOGGLE_ACCOUNT' });
  actor.send({ type: 'SUBMIT', data });
  assert.equal(actor.getSnapshot().matches({ ready: { form: 'reset' } }), true);
  assert.equal(calls.filter(([type]) => type === 'reset').length, 1);
  request.resolve({});
  await tick();
  assert.match(actor.getSnapshot().context.notice, /password-reset link/);
  assert.equal(calls[2][1].redirectTo, 'https://senda.example/reset-password');
  actor.send({ type: 'TOGGLE_ACCOUNT' });
  actor.send({ type: 'SUBMIT', data });
  await tick();
  assert.deepEqual(navigation, ['/app/billing']);
  actor.stop();
});

test('consent keeps the signed query and selects exact create, connect-only, project and rejection payloads', async () => {
  for (const [scopes, projects, selected, accept, access] of [
    [['projects:write'], [{ id: 'one' }], 'new', true, { createProjects: true }],
    [[], [], 'new', true, { connectOnly: true }],
    [[], [{ id: 'one' }], 'one', true, { projectId: 'one' }],
    [[], [{ id: 'one' }, { id: 'two' }], 'two', true, { projectId: 'two' }],
    [['projects:write'], [], 'new', false, {}],
  ]) {
    const query = 'sig=signed&client_id=client&state=kept', calls = [], navigation = [];
    const actor = start(createConsentMachine({
      load: async value => { assert.equal(value, query); return { scopes, projects }; },
      decide: async input => { calls.push(input); return { redirect_uri: 'https://agent.example/return' }; },
      navigate: url => navigation.push(url),
    }));
    actor.send({ type: 'START', query });
    await tick();
    if (selected === 'two') actor.send({ type: 'SELECT', project: selected });
    assert.equal(actor.getSnapshot().context.project, selected);
    actor.send({ type: accept ? 'ACCEPT' : 'REJECT' });
    actor.send({ type: accept ? 'ACCEPT' : 'REJECT' });
    await tick();
    assert.deepEqual(calls, [{ query, accept, ...access }]);
    assert.deepEqual(navigation, ['https://agent.example/return']);
    actor.stop();
  }
});

test('connection close cancels loading and reopening ignores the previous result', async () => {
  const old = deferred(), current = deferred(), signals = [];
  let reads = 0, revoked = 0;
  const actor = start(createConnectionMachine({
    load: signal => { signals.push(signal); return reads++ === 0 ? old.promise : current.promise; },
    tools: async () => 3,
    revoke: async () => { revoked++; },
  }));
  actor.send({ type: 'OPEN' });
  actor.send({ type: 'CLOSE' });
  assert.equal(signals[0].aborted, true);
  actor.send({ type: 'OPEN' });
  old.resolve({ url: 'stale', connections: [] });
  current.resolve({ url: 'current', connections: [{ id: 'one' }] });
  await tick();
  assert.equal(actor.getSnapshot().context.data.url, 'current');
  actor.send({ type: 'REVOKE' });
  actor.send({ type: 'REVOKE' });
  await tick();
  assert.equal(revoked, 1);
  assert.deepEqual(actor.getSnapshot().context.data.connections, []);
  actor.stop();
});

test('checkout return performs the existing initial read plus at most twelve delayed reads and never opens checkout', async () => {
  const clock = new SimulatedClock();
  let reads = 0, opens = 0;
  const actor = start(createBillingMachine({
    load: async () => { reads++; return { available: true, subscription: { active: false } }; },
    open: async () => { opens++; return { url: 'unused' }; }, navigate: () => {},
  }), { clock });
  assert.equal(reads, 0);
  actor.send({ type: 'START', checkout: true });
  await tick();
  for (let retry = 0; retry < 20; retry++) { clock.increment(5000); await tick(); }
  assert.equal(reads, 13);
  assert.equal(opens, 0);
  assert.equal(actor.getSnapshot().matches({ active: { reconciliation: 'complete' } }), true);
  actor.stop();
});

test('email and Google failures allow another attempt, preserve consent callbacks, and ignore late navigation', async () => {
  const search = '?sig=signed&client_id=client&state=kept&error=access_denied';
  const calls = [], navigation = [], late = deferred();
  let sends = 0, social = 0;
  const actor = start(createSignInMachine({
    load: async () => ({ loginMethods: { magicLink: true, google: true } }),
    location: () => ({ origin: 'https://senda.example', search }), navigate: url => navigation.push(url),
    magicLink: async input => { calls.push(input); return sends++ === 0 ? { error: { message: 'Delivery paused.' } } : {}; },
    social: async input => { calls.push(input); if (social++ === 0) throw new Error('offline'); return late.promise; },
  }));
  actor.send({ type: 'START', issue: 'access_denied' });
  await tick();
  actor.send({ type: 'SEND', email: 'a@example.test' });
  await tick();
  assert.equal(actor.getSnapshot().context.error, 'Delivery paused.');
  assert.equal(actor.getSnapshot().hasTag('sent'), false);
  actor.send({ type: 'SEND', email: 'a@example.test' });
  await tick();
  assert.equal(actor.getSnapshot().hasTag('sent'), true);
  actor.send({ type: 'GOOGLE' });
  await tick();
  assert.equal(actor.getSnapshot().context.error, 'Google sign-in could not be reached. Try again.');
  assert.equal(actor.getSnapshot().hasTag('sent'), true);
  assert.equal(calls[2].callbackURL, 'https://senda.example/consent' + search);
  assert.equal(calls[2].errorCallbackURL, 'https://senda.example/sign-in?sig=signed&client_id=client&state=kept');
  actor.send({ type: 'GOOGLE' });
  actor.stop();
  late.resolve({ data: { url: 'https://accounts.example/authorize' } });
  await tick();
  assert.deepEqual(navigation, []);
});

test('capability failure leaves email sign-in disabled and stopping cancels its pending read', async () => {
  const load = deferred();
  let signal, sends = 0;
  const services = {
    load: value => { signal = value; return load.promise; }, location, navigate: () => {},
    magicLink: async () => { sends++; return {}; }, social: async () => ({}),
  };
  const actor = start(createSignInMachine(services));
  actor.send({ type: 'START' });
  load.reject(new Error('Capabilities unavailable.'));
  await tick();
  actor.send({ type: 'SEND', email: 'a@example.test' });
  assert.equal(actor.getSnapshot().context.error, 'Capabilities unavailable.');
  assert.equal(sends, 0);
  actor.stop();
  const pending = start(createSignInMachine({ ...services, load: value => { signal = value; return new Promise(() => {}); } }));
  pending.send({ type: 'START' });
  pending.stop();
  assert.equal(signal.aborted, true);
});

test('password verification retries send the recorded email and preserve registration mode on provider rejection', async () => {
  for (const register of [false, true]) {
    const calls = [], data = { email: 'unverified@example.test', password: 'fixture-password', name: 'A' };
    let attempts = 0, resends = 0;
    const password = async () => {
      if (attempts++ === 0) return { error: { code: 'EMAIL_NOT_VERIFIED', message: 'Verify first.' } };
      throw new Error('offline');
    };
    const actor = start(createPasswordMachine({
      load: async () => ({ accountEmail: true }), location, navigate: () => {},
      signUp: password, signIn: password, reset: async () => ({}),
      verify: async input => { calls.push(input); if (resends++ === 0) throw new Error('offline'); return {}; },
    }));
    actor.send({ type: 'START' });
    await tick();
    if (register) actor.send({ type: 'TOGGLE_ACCOUNT' });
    actor.send({ type: 'SUBMIT', data });
    await tick();
    assert.equal(actor.getSnapshot().matches({ ready: { form: register ? 'register' : 'signIn' } }), true);
    assert.equal(actor.getSnapshot().context.error, 'Verify first.');
    actor.send({ type: 'RESEND' });
    await tick();
    assert.equal(actor.getSnapshot().context.error, 'The email service could not be reached. Try again.');
    actor.send({ type: 'SUBMIT', data });
    await tick();
    assert.equal(actor.getSnapshot().context.error, 'The account service could not be reached. Try again.');
    actor.send({ type: 'RESEND' });
    await tick();
    assert.deepEqual(calls.map(input => input.email), [data.email, data.email]);
    assert.match(actor.getSnapshot().context.notice, /new link is on its way/);
    actor.send({ type: 'TOGGLE_ACCOUNT' });
    assert.equal(actor.getSnapshot().context.verifyEmail, '');
    assert.equal(actor.getSnapshot().context.notice, '');
    actor.stop();
  }
});

test('password capability failure still permits sign-in and stopping prevents a late successful navigation', async () => {
  const result = deferred(), navigation = [];
  const actor = start(createPasswordMachine({
    load: async () => { throw new Error('offline'); }, location, navigate: url => navigation.push(url),
    signIn: () => result.promise, signUp: async () => ({}), reset: async () => ({}), verify: async () => ({}),
  }));
  actor.send({ type: 'START' });
  await tick();
  assert.equal(actor.getSnapshot().context.accountEmail, false);
  actor.send({ type: 'RESET' });
  assert.equal(actor.getSnapshot().matches({ ready: { form: 'signIn' } }), true);
  actor.send({ type: 'SUBMIT', data: { email: 'a@example.test', password: 'fixture-password', name: '' } });
  assert.equal(actor.getSnapshot().hasTag('busy'), true);
  actor.stop();
  result.resolve({ data: { token: 'fixture' } });
  await tick();
  assert.deepEqual(navigation, []);
});

test('consent redirects unauthorized loads with the original query and recovers from a missing return address', async () => {
  const navigation = [], query = 'sig=signed&client_id=client&state=kept';
  const unauthorized = start(createConsentMachine({
    load: async () => { throw Object.assign(new Error('Sign in.'), { status: 401 }); },
    decide: async () => ({}), navigate: url => navigation.push(url),
  }));
  unauthorized.send({ type: 'START', query });
  await tick();
  assert.deepEqual(navigation, ['/sign-in?' + query]);
  unauthorized.stop();
  let attempts = 0;
  const pending = deferred();
  const actor = start(createConsentMachine({
    load: async () => ({ scopes: [], projects: [] }), navigate: url => navigation.push(url),
    decide: async () => attempts++ === 0 ? {} : pending.promise,
  }));
  actor.send({ type: 'ACCEPT' });
  assert.equal(attempts, 0);
  actor.send({ type: 'START', query });
  await tick();
  actor.send({ type: 'ACCEPT' });
  await tick();
  assert.match(actor.getSnapshot().context.error, /return address/);
  actor.send({ type: 'REJECT' });
  actor.send({ type: 'SELECT', project: 'changed-while-submitting' });
  assert.equal(actor.getSnapshot().context.project, 'new');
  actor.stop();
  pending.resolve({ url: 'https://agent.example/return' });
  await tick();
  assert.deepEqual(navigation, ['/sign-in?' + query]);
});

test('connection request errors retain the last connections and allow a later revoke', async () => {
  let reads = 0, revokes = 0;
  const actor = start(createConnectionMachine({
    load: async () => { if (reads++ === 1) throw new Error('Connections offline.'); return { url: 'server', connections: [{ id: 'one' }] }; },
    tools: async () => { throw new Error('Tools unavailable.'); },
    revoke: async () => { if (revokes++ === 0) throw new Error('Disconnect failed.'); },
  }));
  actor.send({ type: 'OPEN' });
  await tick();
  assert.equal(actor.getSnapshot().context.browserTools, null);
  actor.send({ type: 'CLOSE' });
  actor.send({ type: 'OPEN' });
  await tick();
  assert.equal(actor.getSnapshot().context.error, 'Connections offline.');
  assert.equal(actor.getSnapshot().context.data.connections.length, 1);
  actor.send({ type: 'REVOKE' });
  await tick();
  assert.equal(actor.getSnapshot().context.error, 'Disconnect failed.');
  assert.equal(actor.getSnapshot().context.data.connections.length, 1);
  actor.send({ type: 'REVOKE' });
  await tick();
  assert.equal(actor.getSnapshot().context.data.connections.length, 0);
  actor.stop();
});

test('billing stops reconciliation when it is unnecessary, active, unavailable, failed, or unmounted', async () => {
  for (const [checkout, plan] of [
    [false, { available: true }], [true, { available: false }],
    [true, { available: true, subscription: { active: true } }],
  ]) {
    const clock = new SimulatedClock();
    let reads = 0;
    const actor = start(createBillingMachine({
      load: async () => { reads++; return plan; }, open: async () => ({}), navigate: () => {},
    }), { clock });
    actor.send({ type: 'START', checkout });
    await tick();
    clock.increment(60000);
    await tick();
    assert.equal(reads, 1);
    actor.stop();
  }
  for (const status of [500, 401]) {
    const navigation = [], clock = new SimulatedClock();
    let reads = 0;
    const actor = start(createBillingMachine({
      load: async () => { reads++; if (reads === 1) return { available: true }; throw Object.assign(new Error('Read failed.'), { status }); },
      open: async () => ({}), navigate: url => navigation.push(url),
    }), { clock });
    actor.send({ type: 'START', checkout: true });
    await tick();
    clock.increment(5000);
    await tick();
    clock.increment(60000);
    await tick();
    assert.equal(reads, 2);
    assert.deepEqual(navigation, status === 401 ? ['/sign-in?plan=pro'] : []);
    if (status !== 401) assert.equal(actor.getSnapshot().context.error, 'Read failed.');
    actor.stop();
  }
  const clock = new SimulatedClock();
  let reads = 0;
  const actor = start(createBillingMachine({
    load: async () => { reads++; return { available: true }; }, open: async () => ({}), navigate: () => {},
  }), { clock });
  actor.send({ type: 'START', checkout: true });
  await tick();
  actor.stop();
  clock.increment(60000);
  await tick();
  assert.equal(reads, 1);
});

test('billing actions serialize payment-method, portal and checkout requests and unlock after errors', async () => {
  for (const action of ['payment-method', 'portal', 'checkout']) {
    const pending = deferred(), calls = [], navigation = [];
    const actor = start(createBillingMachine({
      load: async () => ({ available: true }), navigate: url => navigation.push(url),
      open: input => { calls.push(input); return calls.length === 1 ? Promise.reject(new Error('Stripe unavailable.')) : pending.promise; },
    }));
    actor.send({ type: 'OPEN', action });
    assert.equal(calls.length, 0);
    actor.send({ type: 'START', checkout: false });
    await tick();
    actor.send({ type: 'OPEN', action });
    actor.send({ type: 'OPEN', action });
    await tick();
    assert.equal(calls.length, 1);
    assert.equal(actor.getSnapshot().hasTag('opening'), false);
    assert.equal(actor.getSnapshot().context.error, 'Stripe unavailable.');
    actor.send({ type: 'OPEN', action });
    assert.equal(actor.getSnapshot().hasTag('opening'), true);
    assert.equal(actor.getSnapshot().context.action, action);
    pending.resolve({ url: 'https://stripe.example/session' });
    await tick();
    actor.send({ type: 'OPEN', action });
    assert.deepEqual(calls, [action, action]);
    assert.deepEqual(navigation, ['https://stripe.example/session']);
    assert.equal(actor.getSnapshot().hasTag('opening'), true);
    actor.stop();
  }
});

test('billing restart aborts the old read and ignores a late result, and stopping suppresses action navigation', async () => {
  const old = deferred(), pending = deferred(), signals = [], navigation = [];
  let reads = 0;
  const actor = start(createBillingMachine({
    load: signal => { signals.push(signal); return reads++ === 0 ? old.promise : Promise.resolve({ available: false }); },
    open: () => pending.promise, navigate: url => navigation.push(url),
  }));
  actor.send({ type: 'START', checkout: true });
  actor.send({ type: 'START', checkout: false });
  assert.equal(signals[0].aborted, true);
  await tick();
  old.resolve({ available: true, subscription: { active: true } });
  await tick();
  assert.equal(actor.getSnapshot().context.plan.available, false);
  actor.send({ type: 'OPEN', action: 'portal' });
  actor.stop();
  pending.resolve({ url: 'https://stripe.example/session' });
  await tick();
  assert.deepEqual(navigation, []);
});

test('billing query changes restart reads without unlocking a pending checkout action', async () => {
  const pending = deferred(), navigation = [];
  let reads = 0, opens = 0;
  const actor = start(createBillingMachine({
    load: async () => { reads++; return { available: true }; },
    open: () => { opens++; return pending.promise; }, navigate: url => navigation.push(url),
  }));
  actor.send({ type: 'START', checkout: true });
  await tick();
  actor.send({ type: 'OPEN', action: 'checkout' });
  actor.send({ type: 'START', checkout: false });
  await tick();
  assert.equal(reads, 2);
  assert.equal(actor.getSnapshot().hasTag('opening'), true);
  actor.send({ type: 'OPEN', action: 'checkout' });
  assert.equal(opens, 1);
  pending.resolve({ url: 'https://stripe.example/session' });
  await tick();
  assert.deepEqual(navigation, ['https://stripe.example/session']);
  actor.stop();
});

test('email callbacks retain the selected model and revision and ignore arbitrary return URLs', async () => {
  const id = '915fee45-5bc0-424b-becf-c1993d91caad';
  for (const [search, destination, retry] of [
    [`?project=${id}&model=to-be&intent=download&revision=4`, `/app/download/${id}?model=to-be&revision=4`, `/sign-in?project=${id}&model=to-be&intent=download&revision=4`],
    ['?returnTo=https://foreign.example', '/app', '/sign-in'],
  ]) {
    const calls = [];
    const actor = start(createSignInMachine({
      load: async () => ({ loginMethods: { magicLink: true } }),
      location: () => ({ origin: 'https://senda.example', search }), navigate: () => {},
      magicLink: async input => { calls.push(input); return {}; }, social: async () => ({}),
    }));
    actor.send({ type: 'START' });
    await tick();
    actor.send({ type: 'SEND', email: 'a@example.test' });
    await tick();
    assert.equal(calls[0].callbackURL, 'https://senda.example' + destination);
    assert.equal(calls[0].errorCallbackURL, 'https://senda.example' + retry);
    actor.stop();
  }
});


test('native v6 account completion checks keep navigation pure and execute it once after the request completes', async () => {
  for (const kind of ['google', 'password', 'consent', 'billing']) {
    const pending = deferred(), navigation = [];
    const navigate = url => navigation.push(url);
    const machine = kind === 'google' ? createSignInMachine({ load: async () => ({ loginMethods: { google: true } }), location, social: () => pending.promise, navigate })
      : kind === 'password' ? createPasswordMachine({ load: async () => ({ accountEmail: true }), location, signIn: () => pending.promise, navigate })
      : kind === 'consent' ? createConsentMachine({ load: async () => ({ scopes: [], projects: [] }), decide: () => pending.promise, navigate })
      : createBillingMachine({ load: async () => ({ available: true }), open: () => pending.promise, navigate });
    const actor = start(machine);
    actor.send(kind === 'consent' ? { type: 'START', query: 'sig=signed' } : { type: 'START', checkout: false });
    await tick();
    actor.send(kind === 'google' ? { type: 'GOOGLE' } : kind === 'password' ? { type: 'SUBMIT', data: { email: 'a@example.test', password: 'fixture-password', name: '' } } : kind === 'consent' ? { type: 'ACCEPT' } : { type: 'OPEN', action: 'portal' });
    const snapshot = actor.getSnapshot(), child = Object.values(snapshot.children)[0];
    const url = kind === 'password' ? '/app/billing' : 'https://service.example/return';
    const output = kind === 'google' ? { data: { url } } : kind === 'password' ? { data: { token: 'fixture' }, email: 'a@example.test', destination: url } : kind === 'consent' ? url : { url };
    const completed = { type: 'xstate.done.actor', actorId: child.id, sessionId: child.sessionId, output };
    assert.equal(snapshot.can(completed), true, kind);
    assert.equal(snapshot.can(completed), true, kind);
    transition(machine, snapshot, completed);
    assert.deepEqual(navigation, [], kind);
    pending.resolve(kind === 'consent' ? { url } : output); await tick();
    assert.deepEqual(navigation, [url], kind);
    actor.stop();
  }
});
