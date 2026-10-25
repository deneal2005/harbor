import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // In dev, forward API calls to the Node server (npm run server) when it is running.
  server: { proxy: { '/api': 'http://localhost:3000' } },
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
});
