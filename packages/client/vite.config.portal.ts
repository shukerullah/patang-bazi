// ============================================
// PATANG BAZI — Portal Build Config
// Produces a single self-contained index.html
// for itch.io, CrazyGames, and similar portals.
//
// Usage: pnpm build:portal
// Reads VITE_SERVER_URL from .env (gitignored)
// Output: dist-portal/index.html
// ============================================

import { defineConfig } from 'vite';
import path from 'path';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@patang/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
