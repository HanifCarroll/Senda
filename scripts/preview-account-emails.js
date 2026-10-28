import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { accountEmail } from "../server/account-email.js";

const directory = path.resolve(process.argv[2] || "output/account-emails"),
  origin = "https://senda.example";
await mkdir(directory, { recursive: true });
for (const kind of ["magic", "verify", "reset"]) {
  const message = accountEmail({
    kind,
    origin,
    url: `${origin}/api/auth/${kind === "magic" ? "magic-link/verify" : kind === "verify" ? "verify-email" : "reset-password/preview-only"}?token=preview-only&callbackURL=${encodeURIComponent(origin + "/app")}`,
  });
  const html = message.html.replace("cid:senda-logo", `data:image/png;base64,${message.attachments[0].content}`);
  await writeFile(path.join(directory, `${kind}.html`), html);
  await writeFile(path.join(directory, `${kind}.txt`), `${message.subject}\n\n${message.text}\n`);
}
console.log(`Email previews saved to ${directory}. Links use a reserved example domain.`);
