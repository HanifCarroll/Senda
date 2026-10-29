import test from 'node:test';
import assert from 'node:assert/strict';
import { savedModelPath, savedModelSignIn, signInDestination, signInRetry, signInRetryForCallback } from '../src/shared/model-links.js';
const id = '915fee45-5bc0-424b-becf-c1993d91caad';

test('saved download and review intent retain exact model and revision through sign-in and retry', () => {
  for (const download of [false, true]) {
    const target = savedModelPath(id, 'to-be', 4, download);
    const signIn = savedModelSignIn(id, 'to-be', 4, download);
    const search = new URL(signIn, 'https://senda.example').search;
    assert.equal(signInDestination(search), target);
    assert.equal(signInRetry(search + '&error=TOKEN_EXPIRED'), signIn);
  }
});

test('return destinations reject foreign URLs, malformed identifiers, models and revision ambiguity', () => {
  for (const query of ['?returnTo=https://evil.example', '?returnTo=//evil.example',
    `?project=${id}&model=unknown&intent=download&revision=4`,
    `?project=${id}&model=to-be&intent=download&revision=0`,
    `?project=${id}&model=to-be&intent=download&revision=1.5`,
    `?project=${id}&model=to-be&intent=download&revision=1e0`,
    `?project=${id}&model=to-be&intent=download&revision=0x1`,
    `?project=${id}&model=to-be&intent=download&revision=9007199254740992`,
    `?project=${id}&model=to-be&intent=download`,
    '?project=../../evil&model=as-is&intent=review&revision=1']) assert.equal(signInDestination(query), '/app');
  assert.equal(signInDestination(`?project=${id}&model=as-is&intent=review`), `/app/projects/${id}?model=as-is`);
  assert.equal(signInDestination('?plan=pro&returnTo=https://evil.example'), '/app/billing');
  assert.equal(signInDestination('?sig=signed&client_id=client&plan=pro'), '/consent?sig=signed&client_id=client&plan=pro');
});

test('an incomplete email link can resume only a same-origin approved destination', () => {
  const origin = 'https://senda.example', path = savedModelPath(id, 'to-be', 4, true);
  assert.equal(signInRetryForCallback(origin + path, origin), savedModelSignIn(id, 'to-be', 4, true));
  for (const target of ['https://evil.example'+path, 'javascript:alert(1)', 'https://user:pass@senda.example'+path, origin+'/unknown'])
    assert.equal(signInRetryForCallback(target, origin), '/sign-in');
});
