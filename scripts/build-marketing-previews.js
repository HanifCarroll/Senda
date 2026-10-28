import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const input = process.argv[2];
if (!input) throw new Error("Usage: node scripts/build-marketing-previews.js <capture-directory>");
const destination = new URL("../public/marketing/", import.meta.url);
const mark = await readFile(new URL("../public/brand/mark.svg", import.meta.url), "utf8");
const escape = value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
for (const name of ["evidence", "overview", "clarification", "evidence-mobile"]) {
  const capture = JSON.parse(await readFile(path.join(input, name + "-vector.json"), "utf8"));
  if (new URL(capture.sourceUrl).pathname !== "/example" || !capture.html.includes("Brightline client onboarding")) {
    throw new Error(name + " must be captured from the public onboarding example");
  }
  const crop = capture.crop || { x: 0, y: 0, width: capture.width, height: capture.height };
  let html = capture.html
    .replace(/<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b([^>]*?)(?<!\/)\s*>/gi, "<$1$2/>")
    .replaceAll("&nbsp;", "&#160;")
    .replace(/src="\/brand\/mark\.svg[^"]*"/g, `src="data:image/svg+xml;base64,${Buffer.from(mark).toString("base64")}"`);
  if (/<script\b|chrome-extension:|src="https?:/i.test(html)) throw new Error("Preview contains an external resource or script");
  const { fontFamily, fontSize, lineHeight, color, background } = capture.bodyStyle;
  // Freeze viewport units as well as media queries so an image scales without reflowing.
  const css = (capture.css + "\n*{animation:none!important;transition:none!important;caret-color:transparent!important}.fixed{position:absolute!important}")
    .replace(/(?<=[\s:(,])(-?[\d.]+)(d?vh|d?vw)\b/g, (_, number, unit) =>
      (Number(number) / 100 * (unit.endsWith("h") ? capture.height : capture.width)) + "px");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${crop.width}" height="${crop.height}" viewBox="${crop.x} ${crop.y} ${crop.width} ${crop.height}" style="font-size:16px"><style>${escape(css)}</style><foreignObject width="${capture.width}" height="${capture.height}"><body xmlns="http://www.w3.org/1999/xhtml" style="position:relative;margin:0;width:${capture.width}px;height:${capture.height}px;font-family:${fontFamily.replaceAll('"', "&quot;")};font-size:${fontSize};line-height:${lineHeight};color:${color};background:${background}">${html}</body></foreignObject></svg>`;
  await writeFile(new URL(name + ".svg", destination), svg);
  console.log(`${name}: ${crop.width} × ${crop.height}, ${Buffer.byteLength(svg)} vector bytes`);
}
