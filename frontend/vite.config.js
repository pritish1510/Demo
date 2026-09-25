import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // changeOrigin stays false (the string shorthand turns it on): keeping the browser's Host header
  // means the backend sees Origin and Host match, so proxied requests are same-origin — no CORS.
  const backend = { target: env.VITE_PROXY_TARGET || 'http://localhost:8080', changeOrigin: false };
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      // In "Live API" mode with an empty base URL, /api and /uploads are proxied to the backend.
      proxy: {
        '/api': backend,
        '/uploads': backend,
      },
    },
  };
});
