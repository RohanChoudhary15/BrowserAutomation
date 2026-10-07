import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auray-queue': {
        target: 'https://queue.auray.run',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/auray-queue/, ''),
      },
      '/auray-platform': {
        target: 'https://api.auray.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/auray-platform/, ''),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
