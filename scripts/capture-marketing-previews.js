// Captures the home page's product previews from the local public example.
//   npm run build && npm run serve            (in another shell)
//   node scripts/capture-marketing-previews.js <capture-directory>
//   npm run build:marketing -- <capture-directory>
// docs/marketing-design.md explains each capture. Needs Chromium: npx playwright install chromium.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { capturePreview } from "./capture-preview-dom.js";

const out = process.argv[2];
if (!out) throw new Error("Usage: node scripts/capture-marketing-previews.js <capture-directory>");
const origin = process.env.SENDA_CAPTURE_ORIGIN || "http://127.0.0.1:3000";
mkdirSync(out, { recursive: true });

// Smallest on-screen text size inside a rectangle, counting the zoom of SVG diagrams.
// Runs in the page, so it must not close over anything.
const minText = (rect, root) => {
  const inside = (r) => r.width > 0 && r.height > 0 && r.right > rect.x && r.left < rect.x + rect.width && r.bottom > rect.y && r.top < rect.y + rect.height;
  let min = Infinity;
  const walker = document.createTreeWalker((root && document.querySelector(root)) || document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node.parentElement;
    if (!node.textContent.trim() || !el || el.closest(".sr-only,script,style,title,desc")) continue;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || !inside(el.getBoundingClientRect())) continue;
    const m = el.closest("text")?.getScreenCTM?.();
    const px = parseFloat(style.fontSize) * (m ? Math.hypot(m.a, m.b) : 1);
    if (px > 0 && px < min) min = px;
  }
  return Math.round(min * 100) / 100;
};
// The readable-capture rule: the page shows every capture at its own size, so 12 px here is 12 px there.
const check = (name, box, px) => {
  console.log(`${name}: ${Math.round(box.width)} × ${Math.round(box.height)}, smallest text ${px} px`);
  if (px < 12) throw new Error(`${name} has ${px} px text; captures need 12 px or more`);
};

const browser = await chromium.launch();
const open = async (route, width, height, deviceScaleFactor = 1) => {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(origin + route, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "*{animation:none!important;transition:none!important}" });
  await hideOverlays(page);
  return page;
};
// The page's header and anything else fixed or sticky would be drawn across a capture, where it looks like
// controls that do nothing. Runs in the page.
const overlays = () => [...document.querySelectorAll("body *")].filter((node) => {
  const style = getComputedStyle(node), box = node.getBoundingClientRect();
  return ["fixed", "sticky"].includes(style.position) && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
});
const hideOverlays = (page) => page.evaluate(`(${overlays})().forEach((node) => node.style.setProperty("visibility", "hidden", "important"))`);
// Stop if the header, or anything else fixed or sticky, would show in a capture.
const clear = async (page, name) => {
  const shown = await page.evaluate(`(${overlays})().map((node) => node.tagName.toLowerCase() + ": " + node.textContent.trim().slice(0, 40))`);
  const header = await page.locator(".marketing > header").isVisible();
  if (header || shown.length) throw new Error(`${name} would show ${header ? "the page's header" : shown.join(", ")}`);
};
const vector = async (page, name, cropSelector, height) => {
  await clear(page, name);
  const capture = await page.evaluate(`(${capturePreview})(${JSON.stringify({ cropSelector })})`);
  if (height) capture.crop.height = height;
  writeFileSync(path.join(out, `${name}-vector.json`), JSON.stringify(capture));
  check(name, capture.crop, await page.evaluate(`(${minText})(${JSON.stringify(capture.crop)})`));
};

// Evidence: the home page's own evidence section with its live example loaded, because these captures hold
// the example's place until it loads. Each is taken at the size the page shows it at, so nothing moves when
// the example replaces it. The example opens on the first draft's main view at 110%, which shows the
// diagram's 11 px labels at 12 px, with "Check handover pack" selected.
const demoSelector = '[data-capture="evidence"]';
const openDemo = async (width, height, deviceScaleFactor) => {
  const page = await open("/", width, height, deviceScaleFactor);
  await page.locator(demoSelector).scrollIntoViewIfNeeded();
  await page.waitForSelector(`${demoSelector} .diagram-stage svg`);
  // The page holds the example to the old capture's height until the width changes, so change it and
  // change it back to capture the example at its own height.
  await page.setViewportSize({ width: width + 1, height });
  await page.waitForFunction((selector) => !document.querySelector(selector + " [data-held]"), demoSelector);
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(500);
  if ((await page.locator(`${demoSelector} [data-slot="card-title"]`).innerText()) !== "Check handover pack") throw new Error("The home page example doesn't open on Check handover pack");
  // Stop if the selected step is cut by the stage's edge, or, on desktop, anything in the diagram is.
  const cut = await page.evaluate((selector) => {
    const stage = document.querySelector(selector + " .diagram-stage").getBoundingClientRect();
    return [...document.querySelectorAll(selector + (innerWidth >= 1024 ? " .diagram-stage g[data-id]" : " .diagram-element.is-selected"))]
      .filter((node) => { const r = node.getBoundingClientRect(); return r.left < stage.left + 4 || r.right > stage.right - 4 || r.top < stage.top + 4 || r.bottom > stage.bottom - 4; })
      .map((node) => node.getAttribute("aria-label") || node.dataset.id);
  }, demoSelector);
  if (cut.length) throw new Error("The evidence capture cuts " + cut.join(", "));
  return page;
};
// Side by side at 1440 px, and with the evidence under the diagram at 1024 px.
for (const [name, width] of [["evidence", 1440], ["evidence-stacked", 1024]]) {
  const page = await openDemo(width, 1100);
  // Keep only the example and its ancestors, so the image doesn't carry the rest of the home page.
  await page.evaluate((selector) => {
    for (let node = document.querySelector(selector); node !== document.body; node = node.parentElement)
      for (const sibling of [...node.parentElement.children]) if (sibling !== node && sibling.tagName !== "SCRIPT") sibling.remove();
    scrollTo(0, 0);
  }, demoSelector);
  await page.waitForTimeout(300);
  const panel = await page.locator(`${demoSelector} .evidence-card`).boundingBox(), passage = await page.getByText("I check that pack before handing work").boundingBox();
  if (!passage || passage.y + passage.height > panel.y + panel.height) throw new Error("The evidence capture doesn't show the interview passage");
  await vector(page, name, demoSelector + " > div");
  await page.context().close();
}
// Question: the first open question of the first draft, 720 px wide. The crop ends 16 px under the
// question's reason, above the two step buttons, which look like answer choices on the home page.
const questionItem = '.reading-column [data-slot="accordion-item"]';
const questionCrop = async (page) => {
  const item = await page.locator(questionItem).first().boundingBox();
  const reason = await page.locator(`${questionItem} [data-slot="accordion-content"] p`).first().boundingBox();
  return { ...item, height: Math.ceil(reason.y + reason.height + 16 - item.y) };
};
{
  const page = await open("/example?draft=true&section=questions", 800, 1000);
  await page.waitForSelector(questionItem);
  await vector(page, "clarification", questionItem, (await questionCrop(page)).height);
  await page.context().close();
}
// The same question and the home page's example as PNGs at device scale 2, at the widths a 390 px and
// a 320 px phone show them.
for (const [suffix, question] of [["", 390], ["-small", 320]]) {
  let page = await open("/example?draft=true&section=questions", question, 844, 2);
  await page.locator(questionItem).first().waitFor();
  let box = await questionCrop(page);
  await clear(page, "clarification-mobile" + suffix);
  await page.screenshot({ path: path.join(out, `clarification-mobile${suffix}.png`), clip: box });
  check("clarification-mobile" + suffix, box, await page.evaluate(`(${minText})(${JSON.stringify(box)})`));
  await page.context().close();

  page = await openDemo(question, 844, 2);
  box = await page.locator(demoSelector).boundingBox();
  await clear(page, "evidence-mobile" + suffix);
  await page.locator(demoSelector).screenshot({ path: path.join(out, `evidence-mobile${suffix}.png`) });
  check("evidence-mobile" + suffix, box, await page.evaluate(`(${minText})(${JSON.stringify(box)}, ${JSON.stringify(demoSelector)})`));
  await page.context().close();
}
await browser.close();
