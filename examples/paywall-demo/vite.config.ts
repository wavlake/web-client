import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages base path
  base: process.env.BASE_URL || '/',
  server: {
    port: 3001,
  },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
});
