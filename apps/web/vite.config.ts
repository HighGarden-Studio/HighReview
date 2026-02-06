import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    proxy: {
      '/api': {
        target: 'http://localhost:8765',
        changeOrigin: true,
        timeout: 900000, // 15 minutes for AI generation
        proxyTimeout: 900000,
      },
    },
  },
  build: {
    outDir: '../cli/public',
    emptyOutDir: true,
    commonjsOptions: {
      include: [/mermaid/, /node_modules/],
    },
  },
  optimizeDeps: {
    include: ['mermaid'],
  },
  ssr: {
    noExternal: ['mermaid'],
  },
});
