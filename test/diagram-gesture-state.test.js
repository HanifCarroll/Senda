import test from 'node:test';
import assert from 'node:assert/strict';
import { createActor, transition } from 'xstate';
import { bindDiagramGestures, createDiagramGestureMachine } from '../src/web/lib/diagram-gesture-machine.js';

function harness() {
  const listeners = new Map(), selection = [], captures = [], frames = [];
  const camera = { x: 20, y: 30, scale: 2, fitted: true };
  const abort = new AbortController();
  bindDiagramGestures({ addEventListener: (name, listener) => listeners.set(name, listener) }, {
    camera: () => camera,
    capture: id => captures.push(id),
    pan: ({ cx, cy, dx, dy }) => {
      camera.x = cx - dx / camera.scale;
      camera.y = cy - dy / camera.scale;
      camera.fitted = false;
      frames.push({ ...camera });
    },
    select: id => { if (id === 'step') selection.push(id); },
  }, abort.signal);
  const send = (type, values = {}) => listeners.get(type)({ button: 0, pointerId: 1, clientX: 100, clientY: 100, target: { closest: () => ({ getAttribute: () => 'step' }) }, ...values });
  return { send, camera, selection, captures, frames, stop: () => abort.abort() };
}

test('a click or movement of at most five pixels selects without changing the camera', t => {
  const h = harness();
  t.after(h.stop);
  h.send('pointerdown');
  h.send('pointermove', { clientX: 103, clientY: 104 });
  h.send('pointerup');
  h.send('click');
  assert.deepEqual(h.selection, ['step']);
  assert.deepEqual(h.captures, []);
  assert.deepEqual(h.frames, []);
  assert.deepEqual(h.camera, { x: 20, y: 30, scale: 2, fitted: true });
});

test('a matching pointer pans from its press camera and consumes exactly the following click', t => {
  const h = harness();
  t.after(h.stop);
  h.send('pointerdown');
  h.send('pointermove', { clientX: 110, clientY: 120 });
  h.send('pointermove', { clientX: 120, clientY: 130 });
  assert.deepEqual(h.camera, { x: 10, y: 15, scale: 2, fitted: false });
  assert.deepEqual(h.captures, [1, 1]);
  h.send('pointerup');
  h.send('click');
  assert.deepEqual(h.selection, []);
  h.send('click');
  assert.deepEqual(h.selection, ['step']);
});

test('other pointer movement and non-primary presses do not pan, and cancellation suppresses a drag click', t => {
  const h = harness();
  t.after(h.stop);
  h.send('pointerdown', { button: 2 });
  h.send('pointermove', { clientX: 140 });
  assert.equal(h.frames.length, 0);
  h.send('pointerdown');
  h.send('pointermove', { pointerId: 2, clientX: 140 });
  assert.equal(h.frames.length, 0);
  h.send('pointermove', { clientX: 140 });
  h.send('pointercancel');
  h.send('click');
  assert.deepEqual(h.selection, []);
  h.send('pointerdown');
  h.send('pointerup');
  h.send('click');
  assert.deepEqual(h.selection, ['step']);
});

test('another pointer ending cannot interrupt the active pointer or release its click suppression', t => {
  for (const end of ['pointerup', 'pointercancel']) {
    const h = harness();
    t.after(h.stop);
    h.send('pointerdown');
    h.send('pointermove', { clientX: 120 });
    h.send(end, { pointerId: 2 });
    h.send('pointermove', { clientX: 140 });
    assert.equal(h.camera.x, 0);
    h.send('pointerup');
    h.send('click');
    assert.deepEqual(h.selection, []);
  }
});

test('transition inspection cannot capture, pan or select; dispatch runs each effect once', t => {
  const effects = [];
  const machine = createDiagramGestureMachine({
    capture: id => effects.push(['capture', id]),
    pan: drag => effects.push(['pan', drag]),
    select: id => effects.push(['select', id]),
  });
  const actor = createActor(machine).start();
  t.after(() => actor.stop());
  actor.send({ type: 'PRESS', button: 0, pointerId: 4, x: 50, y: 60, cx: 10, cy: 20 });
  const before = actor.getSnapshot(), move = { type: 'MOVE', pointerId: 4, x: 70, y: 60 };
  assert.equal(before.can(move), true);
  assert.equal(transition(machine, before, move)[0].value, 'panning');
  assert.deepEqual(effects, []);
  actor.send(move);
  assert.deepEqual(effects, [['capture', 4], ['pan', { cx: 10, cy: 20, dx: 20, dy: 0 }]]);
  actor.send({ type: 'RELEASE', pointerId: 4 });
  actor.send({ type: 'CLICK', id: 'step' });
  actor.send({ type: 'CLICK', id: 'next' });
  assert.deepEqual(effects.at(-1), ['select', 'next']);
  assert.equal(effects.length, 3);
});

test('tearing down the canvas stops gesture effects from late pointer events', () => {
  const h = harness();
  h.send('pointerdown');
  h.stop();
  h.send('pointermove', { clientX: 140 });
  h.send('pointerup');
  h.send('click');
  assert.deepEqual(h.frames, []);
  assert.deepEqual(h.captures, []);
  assert.deepEqual(h.selection, []);
});
