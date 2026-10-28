import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./web", import.meta.url)),
      [fileURLToPath(new URL("./server/skill.js", import.meta.url))]:
        fileURLToPath(new URL("./cloudflare/skill.js", import.meta.url)),
    },
  },
  define: {
    "process.env.PROCESS_SCRIBE_HOSTED": '"1"',
    "process.env.PROCESS_SCRIBE_LOCAL_REVIEW": '"0"',
  },
  build: { outDir: "dist-cloudflare" },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    tanstackStart({ srcDirectory: "web" }),
    react(),
  ],
});
