import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The admin console lives in web/ and builds into dist/, which server.mjs serves.
// `npm run dev:web` proxies /api to a local server; Origin is rewritten so the same-origin checks still pass.
const target = process.env.API_ORIGIN || 'http://127.0.0.1:8787';
export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../dist', emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 800 },
  server: {
    proxy: {
      '/api': { target, changeOrigin: true, configure: proxy => proxy.on('proxyReq', req => req.setHeader('origin', target)) },
    },
  },
});
