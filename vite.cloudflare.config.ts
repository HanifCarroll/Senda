import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
const rendererFiles = [
  ...readdirSync(new URL("./src/core/", import.meta.url)).filter(n => n.endsWith(".js")).map(n => `src/core/${n}`),
  "src/server/review.js", "src/cloudflare/review-cache.js", "package-lock.json",
].sort();
const rendererHash = createHash("sha256");
for (const file of rendererFiles)
  rendererHash.update(file).update(readFileSync(new URL(file, import.meta.url)));
const reviewVersion = rendererHash.digest("hex").slice(0, 24);
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src/web", import.meta.url)),
      "#senda/skill":
        fileURLToPath(new URL("./src/cloudflare/skill.js", import.meta.url)),
    },
  },
  define: {
    "process.env.PROCESS_SCRIBE_HOSTED": '"1"',
    "process.env.PROCESS_SCRIBE_LOCAL_REVIEW": '"0"',
    "process.env.SENDA_REVIEW_VERSION": JSON.stringify(reviewVersion),
  },
  build: { outDir: "dist-cloudflare" },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    tanstackStart({ srcDirectory: "src/web" }),
    react(),
  ],
});
