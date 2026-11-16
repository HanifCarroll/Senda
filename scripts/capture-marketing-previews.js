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
const vector = async (page, name, cropSelector, height) => {
  const capture = await page.evaluate(`(${capturePreview})(${JSON.stringify({ cropSelector })})`);
  if (height) capture.crop.height = height;
  writeFileSync(path.join(out, `${name}-vector.json`), JSON.stringify(capture));
  check(name, capture.crop, await page.evaluate(`(${minText})(${JSON.stringify(capture.crop)})`));
};

const evidenceRoute = "/example?view=Intake&element=CheckPack";
// Evidence: the workspace cropped to the diagram and its evidence panel, 1,008 px wide, which is the
// width the page shows it at. The selected step's evidence is the interviewee's own words. 110% zoom
// lifts the diagram's 11 px labels to 12 px. At that size the whole intake flow is wider than the stage,
// and a narrower panel would push the passage out of view, so the frame holds the three steps the
// passage describes, the decision between them and the end event, with no shape cut by an edge. The
// start event and the merge before the check are off the left.
{
  const page = await open(evidenceRoute, 1056, 850);
  await page.waitForSelector(".diagram-stage svg");
  await page.getByRole("button", { name: "Show evidence" }).click();
  const box = (selector) => page.locator(selector).first().boundingBox();
  let stage = await box(".diagram-stage");
  // Ctrl+wheel zooms by exp(-deltaY × 0.003), so -32 is 110%.
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -32);
  await page.keyboard.up("Control");
  await page.waitForTimeout(300);
  // Drag the canvas until the selected step through the last step is centered in the stage.
  stage = await box(".diagram-stage");
  const shapes = await page.locator(".diagram-stage .diagram-element").evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().toJSON()));
  const selected = await box(".diagram-stage .is-selected");
  const right = Math.max(...shapes.map((r) => r.right)), top = Math.min(...shapes.map((r) => r.top)), bottom = Math.max(...shapes.map((r) => r.bottom));
  const dx = stage.x + stage.width / 2 - (selected.x + right) / 2, dy = stage.y + stage.height / 2 - (top + bottom) / 2;
  const from = [stage.x + stage.width / 2, stage.y + 12];
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(from[0] + dx, from[1] + dy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  // Stop if a step, gateway or event is cut by the stage's edge. Connectors and pools may run off it.
  const cut = await page.evaluate(() => {
    const stage = document.querySelector(".diagram-stage").getBoundingClientRect();
    return [...document.querySelectorAll(".diagram-stage .diagram-element")].map((node) => [node.getAttribute("aria-label") ?? "", node.getBoundingClientRect()])
      .filter(([label, r]) => !label.includes("→") && r.width < 200 && r.right > stage.left && r.left < stage.right && (r.left < stage.left + 8 || r.right > stage.right - 8))
      .map(([label]) => label);
  });
  if (cut.length) throw new Error("The evidence capture cuts " + cut.join(", "));
  // The interviewee's own words must be readable in the panel without scrolling.
  const workspace = await box(".diagram-workspace"), passage = await page.getByText("I check that pack before handing work").boundingBox();
  if (!passage || passage.y + passage.height > workspace.y + workspace.height) throw new Error("The evidence capture doesn't show the interview passage");
  await vector(page, "evidence", ".diagram-workspace");
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
// The same question and the Step evidence sheet as PNGs at device scale 2, at the widths a 390 px and
// a 320 px phone show them.
for (const [suffix, question, sheet] of [["", 390, 350], ["-small", 320, 280]]) {
  let page = await open("/example?draft=true&section=questions", question, 844, 2);
  await page.locator(questionItem).first().waitFor();
  let box = await questionCrop(page);
  await page.screenshot({ path: path.join(out, `clarification-mobile${suffix}.png`), clip: box });
  check("clarification-mobile" + suffix, box, await page.evaluate(`(${minText})(${JSON.stringify(box)})`));
  await page.context().close();

  page = await open(evidenceRoute, sheet, 760, 2);
  await page.getByRole("button", { name: "View evidence" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await page.waitForTimeout(500);
  // Scroll the sheet to its source passages, so the interviewee's own words are in the picture.
  await dialog.getByRole("heading", { name: "Source passages" }).evaluate((heading) => heading.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(200);
  box = await dialog.boundingBox();
  const words = await dialog.getByText("I check that pack before handing work").boundingBox();
  if (!words || words.y + words.height > box.y + box.height) throw new Error(`evidence-mobile${suffix} doesn't show the interview passage`);
  await dialog.screenshot({ path: path.join(out, `evidence-mobile${suffix}.png`) });
  check("evidence-mobile" + suffix, box, await page.evaluate(`(${minText})(${JSON.stringify(box)}, "[role=dialog]")`));
  await page.context().close();
}
await browser.close();
