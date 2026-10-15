import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'electron/main.ts',
      formats: ['cjs'],
      fileName: 'main'
    },
    outDir: 'dist-electron',
    emptyOutDir: true,
    rollupOptions: {
      external: ['electron', 'better-sqlite3', 'electron-log', 'electron-updater', 'node-cron']
    }
  }
});