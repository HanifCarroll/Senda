import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { accountEmail } from "../src/server/account-email.js";

const directory = path.resolve(process.argv[2] || "output/account-emails"),
  origin = "https://senda.example";
await mkdir(directory, { recursive: true });
const message = accountEmail({
  origin,
  url: `${origin}/api/auth/magic-link/verify?token=preview-only&callbackURL=${encodeURIComponent(origin + "/app")}`,
});
const html = message.attachments.reduce((html, attachment) =>
  html.replace(`cid:${attachment.contentId}"`, `data:${attachment.type};base64,${attachment.content}"`), message.html);
await writeFile(path.join(directory, "magic.html"), html);
await writeFile(path.join(directory, "magic.txt"), `${message.subject}\n\n${message.text}\n`);
console.log(`Email previews saved to ${directory}. Links use a reserved example domain.`);
