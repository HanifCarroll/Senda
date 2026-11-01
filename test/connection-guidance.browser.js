// Run explicitly with: node --test test/connection-guidance.browser.js
// Uses an isolated component fixture; never signs in or contacts a real MCP server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium } from 'playwright';

test('connection guidance preserves access controls and explains only available browser tools', { timeout: 60000 }, async t => {
  const webRoot = fileURLToPath(new URL('../src/web', import.meta.url));
  const entry = 'virtual:connection-guidance';
  const bundle = await build({
    configFile: false,
    logLevel: 'silent',
    resolve: { alias: { '@': webRoot } },
    esbuild: { jsx: 'automatic' },
    plugins: [{
      name: 'connection-guidance-fixture',
      resolveId: id => id === entry ? entry : undefined,
      load: id => id === entry ? `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { ConnectAgent } from '@/components/connect-agent';
        createRoot(document.getElementById('app')).render(React.createElement(ConnectAgent));
      ` : undefined,
    }],
    build: { write: false, minify: false, rollupOptions: { input: entry, output: { format: 'es' } } },
  });
  const script = bundle.output.find(output => output.type === 'chunk' && output.isEntry).code;
  const url = 'https://fixture.example.test/mcp';
  let connections, reads, revokes;
  const server = createServer((request, response) => {
    if (request.url === '/dialog.js') {
      response.writeHead(200, { 'content-type': 'text/javascript' });
      response.end(script);
    } else if (request.url === '/api/connections') {
      if (request.method === 'DELETE') { revokes++; connections = []; }
      else reads++;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ url, connections }));
    } else {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<!doctype html><html><head><title>Connection fixture</title></head><body><div id="app"></div><script type="module" src="/dialog.js"></script></body></html>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.SENDA_TEST_BROWSER ? { executablePath: process.env.SENDA_TEST_BROWSER } : {}) });
    for (const tools of [null, [], [{ name: 'apply_revision' }], [{ name: 'read_project' }, { name: 'apply_revision' }], 'unavailable']) {
      await t.test(tools === null ? 'no browser API' : tools === 'unavailable' ? 'browser API failed' : `${tools.length} current project tools`, async () => {
        connections = [{ id: 'one', client: 'fixture-agent', name: 'Fixture assistant' }];
        reads = revokes = 0;
        const page = await browser.newPage({ viewport: { width: 1280, height: 2000 } });
        page.setDefaultTimeout(5000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(tools => {
          Object.defineProperty(document, 'modelContext', { configurable: true, value: tools === null ? undefined : {
            getTools: async () => {
              if (tools === 'unavailable') throw new Error('Unavailable browser API');
              return tools;
            },
          } });
          Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => {
            if (window.rejectClipboard) throw new DOMException('Clipboard denied', 'NotAllowedError');
            window.copiedText = value;
          } } });
        }, tools);
        try {
          await page.goto(origin);
          assert.equal(await page.evaluate(() => typeof document.modelContext?.getTools), tools === null ? 'undefined' : 'function');
          await page.getByRole('button', { name: 'Connect your agent', exact: true }).click();
          await page.getByLabel('Server URL', { exact: true }).waitFor();
          await page.getByText('Fixture assistant', { exact: false }).waitFor();
          assert.equal(await page.getByLabel('Server URL', { exact: true }).inputValue(), url);
          assert.equal(reads, 1);
          assert.equal(await page.getByLabel('Server URL', { exact: true }).evaluate(input => input.readOnly), true);
          assert.equal(await page.getByRole('tab', { name: 'Claude', exact: true }).getAttribute('aria-selected'), 'true');
          assert.equal(await page.getByText(/ChatGPT is in beta/).count(), 0);
          assert.equal(await page.getByText(/does not expose the required WebMCP API/).count(), 0);
          const advanced = page.getByText('Advanced: browser tools', { exact: true });
          if (tools === null || tools === 'unavailable') assert.equal(await advanced.count(), 0);
          else {
            assert.equal(await advanced.locator('..').getAttribute('open'), null);
            await advanced.click();
            if (tools.length === 0) await page.getByText('This browser supports WebMCP.', { exact: false }).waitFor();
            else await page.getByText(`${tools.length} ${tools.length === 1 ? 'tool' : 'tools'} from the open project`, { exact: false }).waitFor();
          }

          await page.getByRole('button', { name: 'Copy server URL', exact: true }).click();
          await page.getByText('URL copied.', { exact: true }).waitFor();
          assert.equal(await page.evaluate(() => window.copiedText), url);
          const prompt = await page.getByLabel('Starter prompt', { exact: true }).inputValue();
          assert.ok(prompt.length > 100);
          assert.equal(await page.getByLabel('Starter prompt', { exact: true }).evaluate(input => input.readOnly), true);
          await page.getByRole('button', { name: 'Copy starter prompt', exact: true }).click();
          await page.getByText('Starter prompt copied.', { exact: true }).waitFor();
          assert.equal(await page.evaluate(() => window.copiedText), prompt);

          await page.evaluate(() => { window.rejectClipboard = true; });
          await page.getByRole('button', { name: 'Copy starter prompt', exact: true }).click();
          await page.getByText('Select the starter prompt and copy it from the field.', { exact: true }).waitFor();
          assert.equal(await page.getByText('Starter prompt copied.', { exact: true }).count(), 0);
          await page.getByRole('button', { name: 'Copy server URL', exact: true }).click();
          await page.getByText('Select the URL and copy it from the field.', { exact: true }).waitFor();
          assert.equal(await page.getByText('URL copied.', { exact: true }).count(), 0);

          await page.getByRole('tab', { name: 'Claude', exact: true }).focus();
          await page.keyboard.press('ArrowRight');
          await page.getByRole('tab', { name: 'ChatGPT', exact: true, selected: true }).waitFor();
          await page.getByText(/ChatGPT is in beta/).waitFor();
          assert.equal(await page.getByRole('tabpanel').count(), 1);
          await page.getByText('Using the older Apps screen?', { exact: true }).click();
          await page.getByText('Workspace settings → Apps → Create', { exact: true }).waitFor();

          await page.getByRole('button', { name: 'Disconnect remote agents', exact: true }).click();
          await page.getByText('No agent has access yet.', { exact: true }).waitFor();
          assert.equal(revokes, 1);
          assert.equal(await page.getByText('Fixture assistant', { exact: false }).count(), 0);
          await page.getByRole('button', { name: 'Close', exact: true }).click();
          await Promise.all([
            page.waitForResponse(response => response.url() === `${origin}/api/connections` && response.request().method() === 'GET'),
            page.getByRole('button', { name: 'Connect your agent', exact: true }).click(),
          ]);
          await page.getByText('No agent has access yet.', { exact: true }).waitFor();
          assert.equal(reads, 2);
          assert.equal(await page.getByText('Select the starter prompt and copy it from the field.', { exact: true }).count(), 0);
          assert.equal(await page.getByText('Select the URL and copy it from the field.', { exact: true }).count(), 0);
          assert.deepEqual(errors, []);
        } catch (error) {
          if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`, { cause: error });
          throw error;
        } finally {
          await page.close();
        }
      });
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
