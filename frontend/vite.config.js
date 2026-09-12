import { defineConfig, loadEnv } from 'vite';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
    || env.SUPABASE_PUBLISHABLE_KEY
    || env.SUPABASE_ANON_KEY
    || '';

  return {
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',
  },


  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
  },

  build: { target: 'esnext', rollupOptions: { input: Object.fromEntries(
    readdirSync(dirname(fileURLToPath(import.meta.url)))
      .filter((file) => file.endsWith('.html'))
      .map((file) => [file.replace(/\.html$/, ''), resolve(dirname(fileURLToPath(import.meta.url)), file)])
  ) } }
  };
});
