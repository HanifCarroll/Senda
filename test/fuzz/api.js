import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApplication } from '../../src/server/application.js';
import { runSchemathesis } from './schemathesis.mjs';

await runSchemathesis(async origin => {
  const directory = await mkdtemp(path.join(tmpdir(), 'senda-fuzz-'));
  let application;
  try {
    application = await createApplication({ origin, directory, secret: 'synthetic-fuzz-secret-never-used-in-production' });
    const signup = await application.handle(new Request(`${origin}/api/auth/sign-up/email`, {
      method: 'POST', headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'fuzz@example.test', password: 'synthetic-fuzz-password', name: 'Fuzz test' }),
    }));
    assert.equal(signup.status, 200, 'Local test account must be created before fuzzing');
    const cookie = signup.headers.getSetCookie().map(item => item.split(';')[0]).join('; ');
    assert.ok(cookie, 'Local session cookie must be available');
    const account = await signup.json();
    const project = await application.projects.create({ userId: account.user.id }, {
      name: 'Synthetic process', purpose: 'Exercise local contracts', perspective: 'Test operator',
    });
    const schema = JSON.parse(await readFile(new URL('./openapi.json', import.meta.url), 'utf8'));
    const projectParameter = schema.paths['/api/browser-tools'].get.parameters[0];
    projectParameter.schema.enum = [project.id];
    projectParameter.example = project.id;
    await writeFile('tmp/fuzz/openapi.json', JSON.stringify(schema));
    return {
      async handle(request) {
        const headers = new Headers(request.headers);
        headers.set('cookie', cookie);
        return application.handle(new Request(request, { headers }));
      },
      async close() { application.close(); await rm(directory, { recursive: true, force: true }); },
    };
  } catch (error) {
    application?.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}, 'tmp/fuzz/openapi.json');
