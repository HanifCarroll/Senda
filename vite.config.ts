import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export default defineConfig({
  server: { host: '127.0.0.1', port: 3000, strictPort: true },
  preview: { host: '127.0.0.1', port: 3000, strictPort: true },
  resolve: { alias: { '@': fileURLToPath(new URL('./src/web', import.meta.url)) } },
  plugins: [
    { name: 'senda-hosted', async configureServer(server) {
      if (process.env.SENDA_HOSTED !== '1') return;
      const { createApplication } = await import('./src/server/application.js');
      const { createNodeHandler } = await import('./src/server/node-adapter.js');
      if (!process.env.SENDA_DATA) (await import('./src/core/store.js')).moveLegacyDataFolder();
      const origin = process.env.APP_URL || 'http://127.0.0.1:3000';
      const app = await createApplication({ origin, directory: path.resolve(process.env.SENDA_DATA || '.senda/hosted'), secret: process.env.BETTER_AUTH_SECRET });
      server.middlewares.use(createNodeHandler(app, origin));
      server.httpServer?.on('close', () => app.close());
    } },
    tailwindcss(), tanstackStart({ srcDirectory: 'src/web' }), react()
  ],
})
