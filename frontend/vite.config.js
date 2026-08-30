import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';

// Multi-page build: every top-level .html file in frontend/ is a real page
// (CLX is a multi-page app, not an SPA).
const htmlPages = readdirSync(__dirname)
  .filter((f) => f.endsWith('.html'))
  .reduce(
    (inputs, page) => {
      inputs[page.replace(/\.html$/, '')] = resolve(__dirname, page);
      return inputs;
    },
    { main: resolve(__dirname, 'index.html') }
  );

export default defineConfig({
  appType: 'mpa',
  build: {
    target: 'esnext',
    rollupOptions: {
      input: htmlPages,
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',
  },
});
