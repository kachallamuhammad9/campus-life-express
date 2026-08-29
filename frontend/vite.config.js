import { defineConfig } from 'vite';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  preview: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [
    {
      name: 'clx-backend-api',
      configureServer(server) {
        let backendApp = null;
        try {
          backendApp = require('./clx-backend/src/app.js');
        } catch (e) {
          console.error('[Vite] Error loading backend app:', e);
        }

        server.middlewares.use((req, res, next) => {
          if (backendApp && req.url && (req.url.startsWith('/api/') || req.url === '/api' || req.url.startsWith('/api?'))) {
            backendApp(req, res, next);
          } else {
            next();
          }
        });
      },
      configurePreviewServer(server) {
        let backendApp = null;
        try {
          backendApp = require('./clx-backend/src/app.js');
        } catch (e) {
          console.error('[Vite] Error loading backend app for preview:', e);
        }

        server.middlewares.use((req, res, next) => {
          if (backendApp && req.url && (req.url.startsWith('/api/') || req.url === '/api' || req.url.startsWith('/api?'))) {
            backendApp(req, res, next);
          } else {
            next();
          }
        });
      }
    }
  ]
});
