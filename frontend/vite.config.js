import { defineConfig } from 'vite';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export default defineConfig({
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',
  },


  build: { target: 'esnext', rollupOptions: { input: Object.fromEntries(
    readdirSync(dirname(fileURLToPath(import.meta.url)))
      .filter((file) => file.endsWith('.html'))
      .map((file) => [file.replace(/\.html$/, ''), resolve(dirname(fileURLToPath(import.meta.url)), file)])
  ) } }
});
