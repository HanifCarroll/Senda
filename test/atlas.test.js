import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { scenes, sceneIds } from '../tests/atlas/scenes.mjs';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('atlas/atlas.json', root), 'utf8'));
const idPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function idsOf(rows) {
  const ids = new Set();
  for (const { id } of rows) {
    assert.equal(typeof id, 'string');
    assert.match(id, idPattern);
    assert.ok(id.length <= 80, `${id}: ID exceeds 80 characters`);
    assert.ok(!ids.has(id), `Duplicate ID: ${id}`);
    ids.add(id);
  }
  return ids;
}

test('Atlas manifest follows the app contract', () => {
  assert.equal(manifest.version, 1);
  assert.deepEqual(manifest.app, { id: 'senda', name: 'Senda' });
  assert.ok(manifest.areas.length <= 100 && manifest.states.length <= 500 && manifest.flows.length <= 100);
  const areas = idsOf(manifest.areas);
  const ids = idsOf(manifest.states);
  idsOf(manifest.flows);
  for (const state of manifest.states) {
    const { id, viewport, area, image, phone, sources } = state;
    assert.ok(areas.has(area), `${id}: unknown area ${area}`);
    assert.ok(['desktop', 'phone'].includes(viewport), `${id}: unknown viewport ${viewport}`);
    assert.equal(image, `shots/${viewport}/${id}.png`);
    assert.ok(!Object.hasOwn(state, 'capture'), `${id}: capture metadata belongs to Atlas`);
    if (Object.hasOwn(state, 'phone')) {
      assert.equal(viewport, 'desktop', `${id}: dual states must start with desktop`);
      assert.deepEqual(phone, { image: `shots/phone/${id}.png` });
    } else {
      assert.ok(state.notes?.trim(), `${id}: explain why the other viewport is unavailable`);
    }
    assert.ok(Array.isArray(sources) && sources.length > 0 && sources.length <= 100, `${id}: sources must have 1–100 paths`);
    assert.equal(new Set(sources).size, sources.length, `${id}: duplicate source paths`);
    for (const source of sources) {
      assert.equal(typeof source, 'string');
      assert.ok(source.length <= 1024 && !/[\\:#?%]/.test(source) && source.split('/').every(part => part && part !== '.' && part !== '..'),
        `${id}: source must be repo-relative: ${source}`);
      assert.ok(existsSync(new URL(source, root)), `${id}: source does not exist: ${source}`);
    }
  }
  for (const { id, area, steps, branches } of manifest.flows) {
    assert.ok(areas.has(area), `${id}: unknown area ${area}`);
    assert.ok(steps.length && steps.length <= 200 && branches.length <= 200, `${id}: invalid number of steps or branches`);
    for (const { from, to, action } of [...steps, ...branches]) {
      assert.ok(ids.has(from) && ids.has(to) && action.trim(), `${id}: invalid edge ${from} → ${to}`);
    }
    for (const [i, step] of steps.entries()) {
      assert.ok(!Object.hasOwn(step, 'kind'), `${id}: only branches have a kind`);
      if (i) assert.equal(steps[i - 1].to, step.from, `${id}: disconnected step ${i + 1}`);
    }
    for (const { kind } of branches) assert.ok(['alt', 'empty', 'error'].includes(kind), `${id}: unknown branch kind ${kind}`);
  }
});

test('every Atlas state has exactly one browser checkpoint and vice versa', () => {
  const checkpoints = scenes.flatMap(sceneIds);
  assert.equal(new Set(checkpoints).size, checkpoints.length, 'Duplicate Atlas checkpoints');
  assert.deepEqual(new Set(checkpoints), idsOf(manifest.states));
});

test('every web route appears in the Atlas map or supports a mapped state', () => {
  const sources = new Set(manifest.states.flatMap(state => state.sources));
  const routes = 'src/web/routes/';
  for (const file of readdirSync(new URL(routes, root), { recursive: true, encoding: 'utf8' })) {
    if (/\.[jt]sx?$/.test(file)) assert.ok(sources.has(routes + file), `${file}: no mapped state depends on this route`);
  }
});
