import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';
import { getPlatformProxy } from 'wrangler';
import { scenes, sceneIds } from './scenes.mjs';

const viewports = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const maxPixels = 16_384;
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function screenshot(page, file, viewportOnly, { viewport, deviceScaleFactor }) {
  const fullPage = !viewportOnly;
  const size = await page.evaluate(async fullPage => {
    if (fullPage) window.scrollTo({ top: 0, behavior: 'instant' });
    const images = Array.from(document.images).filter(img => img.getClientRects().length && (img.currentSrc || img.src));
    for (const img of images) img.loading = 'eager';
    let timer;
    try {
      await Promise.race([
        Promise.all([document.fonts.ready, ...images.map(img => img.decode())]),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Assets did not finish loading')), 15_000); }),
      ]);
    } finally { clearTimeout(timer); }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const root = document.documentElement;
    return { width: Math.max(root.scrollWidth, document.body.scrollWidth), height: Math.max(root.scrollHeight, document.body.scrollHeight) };
  }, fullPage);
  const cap = Math.floor(maxPixels / deviceScaleFactor);
  const clip = fullPage && (size.height > cap || size.width > viewport.width)
    ? { x: 0, y: 0, width: viewport.width, height: Math.min(size.height, cap) } : undefined;
  const png = await page.screenshot({ fullPage, clip, animations: 'disabled', caret: 'hide' });
  assert.equal(png.readUInt32BE(16), viewport.width * deviceScaleFactor, 'Unexpected screenshot width');
  assert.ok(png.readUInt32BE(20) <= maxPixels && png.length <= 25 * 1024 * 1024, 'Screenshot exceeds Atlas limits');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, png);
}

function failure(label, error) {
  // Playwright errors can contain URLs, including single-use links. Report only
  // the checkpoint, error class, and local source line, never the call log.
  const line = error.stack?.match(/\b(scenes|browser)\.mjs:(\d+):\d+/);
  const kind = error.name === 'TimeoutError' ? 'timed out' : error.name === 'AssertionError' ? 'assertion failed' : 'failed';
  return `${label} ${kind}${line ? ` (${line[1]}.mjs:${line[2]})` : ''}`;
}

async function replay({ browser, mode, scene, pending, base, out, readMail, failures, signal }) {
  const contexts = [];
  const createPage = async () => {
    const context = await browser.newContext({
      ...viewports[mode], reducedMotion: 'reduce', acceptDownloads: true,
      serviceWorkers: 'block', locale: 'en-US', timezoneId: 'UTC',
    });
    contexts.push(context);
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    return page;
  };
  let last = 'start';
  try {
    for await (const step of scene({ base, createPage, readMail, phone: mode === 'phone' })) {
      signal.throwIfAborted();
      last = step.id;
      if (!pending.has(step.id)) continue;
      try {
        await step.proof.waitFor({ state: 'visible' });
        if (step.scroll) await step.scroll.evaluate(el => el.scrollIntoView({ block: 'center' }));
        await screenshot(step.proof.page(), join(out, pending.get(step.id)), step.viewportOnly, viewports[mode]);
        await step.verify?.();
        pending.delete(step.id);
        failures.delete(step.id);
        console.error(`Atlas: ${mode} ${step.id}`);
      } catch (error) {
        failures.set(step.id, failure(`${mode} ${step.id}`, error));
      }
      // Once the final requested checkpoint was reached, do not stage later states.
      if ([...pending.keys()].every(id => failures.has(id))) break;
    }
  } catch (error) {
    signal.throwIfAborted();
    const reason = failure(`${mode} setup after ${last}`, error);
    for (const id of pending.keys()) if (!failures.has(id)) failures.set(id, reason);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
}

export async function captureStates({ app, base, out, scratch, state, states, signal }) {
  const proxy = await getPlatformProxy({ configPath: join(app, 'wrangler.jsonc'), remoteBindings: false, persist: { path: join(state, 'v3') } });
  let browser;
  const cancel = () => { void browser.close().catch(() => {}); };
  try {
    signal.throwIfAborted();
    browser = await chromium.launch({
      executablePath: process.env.SENDA_TEST_BROWSER || (existsSync(macChrome) ? macChrome : undefined),
      downloadsPath: join(scratch, 'downloads'),
      env: { PATH: process.env.PATH, HOME: scratch, TMPDIR: scratch },
    });
    signal.throwIfAborted();
    signal.addEventListener('abort', cancel, { once: true });
    const outbox = /** @type {{ get(key: string): Promise<{ json(): Promise<{ text: string }> } | null> }} */ (proxy.env.SNAPSHOTS);
    const readMail = async key => {
      const entry = await outbox.get(`test-outbox/${key}.json`);
      assert.ok(entry, 'The local sign-in outbox has no message');
      return (await entry.json()).text;
    };
    const reasons = new Map(states.map(({ id }) => [id, []]));
    for (const mode of Object.keys(viewports)) {
      const files = new Map(states.flatMap(state => {
        const image = state.viewport === mode ? state.image : mode === 'phone' && state.phone?.image;
        return image ? [[state.id, image]] : [];
      }));
      for (const scene of scenes) {
        const ids = sceneIds(scene);
        const pending = new Map(ids.filter(id => files.has(id)).map(id => [id, files.get(id)]));
        if (!pending.size) continue;
        let failures;
        for (let attempt = 0; attempt < 2 && pending.size; attempt++) {
          signal.throwIfAborted();
          failures = new Map();
          await replay({ browser, mode, scene, pending, base, out, readMail, failures, signal });
        }
        for (const id of pending.keys()) reasons.get(id).push(failures.get(id) ?? `${mode} checkpoint not reached`);
      }
      const mapped = new Set(scenes.flatMap(sceneIds));
      for (const id of files.keys()) if (!mapped.has(id)) reasons.get(id).push(`${mode} capture step missing`);
    }
    for (const { id, image, phone } of states) {
      if (!reasons.get(id).length) continue;
      await rm(join(out, image), { force: true });
      if (phone) await rm(join(out, phone.image), { force: true });
    }
    return new Map([...reasons].map(([id, errors]) => [id, errors.length ? errors.join('; ') : null]));
  } finally {
    signal.removeEventListener('abort', cancel);
    try { await browser?.close(); }
    finally { await proxy.dispose(); }
  }
}
