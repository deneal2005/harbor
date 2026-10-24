import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // GitHub Pages serves the app from /Harbor/ (set by .github/workflows/pages.yml); everywhere else it is /.
  base: process.env.BASE_PATH || '/',
  // In dev, forward API calls to the Node server (npm run server) when it is running.
  server: { proxy: { '/api': 'http://localhost:3000' } },
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
});
