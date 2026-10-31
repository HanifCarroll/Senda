import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApplication } from '../../src/server/application.js';
import { Project } from '../../src/core/service.js';
import { runSchemathesis } from './schemathesis.mjs';

await runSchemathesis(async origin => {
  const directory = await mkdtemp(path.join(tmpdir(), 'senda-fuzz-'));
  let application;
  try {
    application = await createApplication({ origin, directory, secret: 'synthetic-fuzz-secret-never-used-in-production' });
    async function account(email) {
      const response = await application.handle(new Request(`${origin}/api/auth/sign-up/email`, {
        method: 'POST', headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: 'synthetic-fuzz-password', name: 'Fuzz test' }),
      }));
      assert.equal(response.status, 200);
      return { actor: { userId: (await response.json()).user.id }, cookie: response.headers.getSetCookie().map(item => item.split(';')[0]).join('; ') };
    }
    const owner = await account('fuzz@example.test'), other = await account('other@example.test');
    const input = { name: 'Synthetic process', purpose: 'Exercise local contracts', perspective: 'Test operator' };
    const project = await application.projects.create(owner.actor, input);
    const foreign = await application.projects.create(other.actor, { ...input, name: 'Other account private process' });
    await application.projects.apply(owner.actor, project.id, { expectedRevision: 1, summary: 'Ask a clarification',
      questions: [{ id: 'Question', question: 'Who checks orders?', why: 'Identify responsibility' }],
    });
    const filename = id => path.join(directory, 'projects', id, 'senda.sqlite');
    const baseline = await readFile(filename(project.id));
    const catalog = () => application.projects.db.prepare('SELECT * FROM projects ORDER BY id').all();
    const initialCatalog = catalog();
    const snapshot = id => {
      const p = new Project(path.dirname(filename(id)));
      try { return p.read(); } finally { p.close(); }
    };
    const saved = snapshot(project.id), foreignSaved = snapshot(foreign.id);
    const schema = JSON.parse(await readFile(new URL('./openapi.json', import.meta.url), 'utf8'));
    for (const endpoint of Object.values(schema.paths)) for (const operation of Object.values(endpoint)) {
      for (const parameter of operation.parameters ?? []) if (parameter.name === 'project') {
        parameter.schema.enum = [project.id, foreign.id, '00000000-0000-4000-8000-000000000000'];
        parameter.example = project.id;
      }
    }
    await writeFile('tmp/fuzz/openapi.json', JSON.stringify(schema));
    const successes = new Set();
    async function exercise(request, cookie = owner.cookie) {
      const url = new URL(request.url), headers = new Headers(request.headers);
      if (cookie) headers.set('cookie', cookie); else headers.delete('cookie');
      headers.set('origin', origin);
      const isRestore = url.pathname === `/api/projects/${project.id}/restore`;
      if (isRestore) await application.projects.delete(owner.actor, project.id);
      const before = catalog();
      const text = !['GET', 'HEAD'].includes(request.method) ? await request.clone().text() : '';
      let payload; try { payload = JSON.parse(text); } catch { /* Invalid body remains unchanged for the real handler. */ }
      try {
        const response = await application.handle(new Request(request, { headers }));
        if (!response) return response;
        if (url.pathname.includes(foreign.id) || url.searchParams.get('project') === foreign.id)
          assert.ok(response.status >= 400 && response.status < 500, 'Another account must never be visible');
        assert.deepEqual(snapshot(foreign.id), foreignSaved);
        if (response.status >= 400) {
          assert.deepEqual(snapshot(project.id), saved, 'Rejected requests must not append a revision');
          assert.deepEqual(catalog(), before, 'Rejected requests must not mutate the catalog');
        } else if (request.method === 'POST') {
          const data = await response.clone().json();
          if (url.pathname === '/api/projects') {
            assert.equal(response.status, 201); assert.equal(data.name, payload.name.trim());
            assert.equal(application.projects.authorize(owner.actor, data.id).owner, owner.actor.userId);
          } else if (url.pathname.endsWith('/delete')) {
            assert.equal(application.projects.list(owner.actor).length, 0);
          } else if (url.pathname.endsWith('/restore')) {
            assert.equal(application.projects.list(owner.actor).length, 1);
          } else {
            assert.equal(payload.expectedRevision, 2);
            assert.equal(data.revision, snapshot(project.id).revision);
            if (url.pathname.endsWith('/read')) assert.equal(snapshot(project.id).discovery.context.scopeNotes,
              payload.context?.scopeNotes ?? saved.discovery.context.scopeNotes);
            if (url.pathname.endsWith('/sources')) assert.equal(snapshot(project.id).discovery.sources.at(-1).text, payload.source.text.replace(/\r\n?/g, '\n'));
            if (url.pathname.endsWith('/answers')) {
              const state = snapshot(project.id);
              assert.equal(state.discovery.sources.at(-1).text, payload.text.trim().replace(/\r\n?/g, '\n'));
              assert.equal(state.discovery.sources.at(-1).origin, 'clarification:Question');
              assert.equal(state.discovery.questions[0].status, 'open', 'Saving an answer must not invent an evidence reconciliation');
            }
          }
          successes.add(url.pathname.replace(project.id, '{project}'));
        }
        return response;
      } finally {
        // Each generated case starts from the same real persisted revision. Reset
        // only fixture storage, after production methods have closed their handles.
        await writeFile(filename(project.id), baseline);
        const extra = catalog().filter(row => !initialCatalog.some(seed => seed.id === row.id));
        for (const row of extra) {
          application.projects.db.prepare('DELETE FROM grants WHERE project=?').run(row.id);
          application.projects.db.prepare('DELETE FROM projects WHERE id=?').run(row.id);
          await rm(path.dirname(filename(row.id)), { recursive: true, force: true });
        }
        for (const row of initialCatalog) application.projects.db.prepare('UPDATE projects SET state=?,deleted_at=?,generation=? WHERE id=?')
          .run(row.state, row.deleted_at, row.generation, row.id);
      }
    }
    // Required happy paths and denial paths make an all-rejected campaign fail
    // even when response conformance alone would allow the rejection.
    for (const [route, endpoint] of Object.entries(schema.paths)) if (endpoint.post) {
      const pathname = route.replace('{project}', project.id);
      const body = endpoint.post.requestBody.content['application/json'].example;
      const request = () => new Request(`${origin}${pathname}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      assert.ok((await exercise(request())).ok, `Required workflow must succeed: ${pathname}`);
      assert.equal((await exercise(request(), '')).status, 401);
      if (route.includes('{project}')) assert.equal((await exercise(request(), other.cookie)).status, 404);
    }
    // The application accepts more than the bounded generation schema. Its
    // validation errors and valid partial/no-op revisions must survive this oracle.
    assert.equal((await exercise(new Request(`${origin}/api/projects/${foreign.id}/read`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    }))).status, 400);
    assert.equal((await exercise(new Request(`${origin}/api/browser-tools?project=${foreign.id}&model=invalid`))).status, 400);
    for (const extra of [{}, { context: {} }]) {
      const response = await exercise(new Request(`${origin}/api/projects/${project.id}/read`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedRevision: 2, summary: 'No content change', ...extra }),
      }));
      assert.equal(response.status, 200);
      const value = await response.json();
      assert.equal(value.unchanged, true); assert.equal(value.revision, 2);
    }
    return {
      handle: request => exercise(request),
      async close() {
        try {
          for (const [route, endpoint] of Object.entries(schema.paths)) if (endpoint.post) assert.ok(successes.has(route));
          console.log(`Verified ${successes.size} successful write workflows plus anonymous and cross-account denial.`);
        } finally { application.close(); await rm(directory, { recursive: true, force: true }); }
      },
    };
  } catch (error) {
    application?.close(); await rm(directory, { recursive: true, force: true }); throw error;
  }
}, 'tmp/fuzz/openapi.json');
