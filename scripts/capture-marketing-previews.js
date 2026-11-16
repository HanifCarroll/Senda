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
  return page;
};
const vector = async (page, name, cropSelector) => {
  const capture = await page.evaluate(`(${capturePreview})(${JSON.stringify({ cropSelector })})`);
  writeFileSync(path.join(out, `${name}-vector.json`), JSON.stringify(capture));
  check(name, capture.crop, await page.evaluate(`(${minText})(${JSON.stringify(capture.crop)})`));
};

// Evidence: the workspace cropped to the diagram and its evidence panel, 1,008 px wide, which is the
// width the page shows it at. 120% zoom lifts the diagram's 11 px labels to 13 px.
{
  const page = await open("/example?view=FinanceWork&element=Invoice", 1056, 850);
  await page.waitForSelector(".diagram-stage svg");
  await page.getByRole("button", { name: "Show evidence" }).click();
  await page.getByRole("separator").focus();
  await page.keyboard.press("ArrowLeft");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.waitForTimeout(300);
  // Pan with the arrow keys (60 px a press) until the selected step is in the middle of the stage.
  const box = (selector) => page.locator(selector).first().boundingBox();
  const stage = await box(".diagram-stage"), step = await box(".diagram-stage .is-selected");
  const dx = stage.x + stage.width / 2 - (step.x + step.width / 2), dy = stage.y + stage.height / 2 - (step.y + step.height / 2);
  await page.locator(".diagram-stage").focus();
  for (let i = 0; i < Math.round(Math.abs(dx) / 60); i++) await page.keyboard.press(dx < 0 ? "ArrowRight" : "ArrowLeft");
  for (let i = 0; i < Math.round(Math.abs(dy) / 60); i++) await page.keyboard.press(dy < 0 ? "ArrowDown" : "ArrowUp");
  await page.waitForTimeout(300);
  await vector(page, "evidence", ".diagram-workspace");
  await page.context().close();
}
// Question: the first open question of the first draft, 720 px wide.
{
  const page = await open("/example?draft=true&section=questions", 800, 1000);
  await page.waitForSelector('.reading-column [data-slot="accordion-item"]');
  await vector(page, "clarification", '.reading-column [data-slot="accordion-item"]');
  await page.context().close();
}
// The same question and the Step evidence sheet as PNGs at device scale 2, at the widths a 390 px and
// a 320 px phone show them.
for (const [suffix, question, sheet] of [["", 390, 350], ["-small", 320, 280]]) {
  let page = await open("/example?draft=true&section=questions", question, 844, 2);
  const item = page.locator('.reading-column [data-slot="accordion-item"]').first();
  await item.waitFor();
  await item.screenshot({ path: path.join(out, `clarification-mobile${suffix}.png`) });
  let box = await item.boundingBox();
  check("clarification-mobile" + suffix, box, await page.evaluate(`(${minText})(${JSON.stringify(box)})`));
  await page.context().close();

  page = await open("/example?view=FinanceWork&element=Invoice", sheet, 760, 2);
  await page.getByRole("button", { name: "View evidence" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await page.waitForTimeout(500);
  await dialog.screenshot({ path: path.join(out, `evidence-mobile${suffix}.png`) });
  box = await dialog.boundingBox();
  check("evidence-mobile" + suffix, box, await page.evaluate(`(${minText})(${JSON.stringify(box)}, "[role=dialog]")`));
  await page.context().close();
}
await browser.close();
