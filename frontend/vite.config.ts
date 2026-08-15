import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // REST → Backend Node.js (Step 3)
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      // WebSocket → Live Inbox
      '/ws': { target: 'ws://localhost:4000', ws: true },
    },
  },
});
