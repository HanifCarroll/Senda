import { spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const target = new URL(process.argv[2] || process.env.APP_URL || "http://127.0.0.1:3000/app");
if (
  target.protocol !== "https:" &&
  !(target.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname))
)
  throw new Error("Open an HTTPS site or a loopback development URL.");
const candidates = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);
let executable;
for (const candidate of candidates) {
  try {
    await access(candidate);
    executable = candidate;
    break;
  } catch {}
}
if (!executable) throw new Error("Set CHROME_PATH to a Chrome 149 or newer executable.");
const directory =
  process.env.SENDA_BROWSER_PROFILE ||
  path.join(homedir(), ".codex", "browser-profiles", "senda-webmcp");
await mkdir(directory, { recursive: true, mode: 0o700 });
const port = Number(process.env.SENDA_BROWSER_PORT || 9227);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Choose a browser debugging port between 1024 and 65535.");
const child = spawn(
  executable,
  [
    `--user-data-dir=${directory}`,
    "--enable-features=WebMCP",
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    "--no-first-run",
    "--no-default-browser-check",
    target.href,
  ],
  { detached: true, stdio: "ignore" },
);
child.unref();
console.log(
  `Opened Senda's separate Chrome profile at ${target.href}. Browser tools connect on loopback port ${port}.`,
);
