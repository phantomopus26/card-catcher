import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src',
  base: './',
  build: {
    outDir: '../dist/renderer',
    emptyDirFirst: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/renderer/index.html'),
        overlay: path.resolve(__dirname, 'src/overlay/index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
});
