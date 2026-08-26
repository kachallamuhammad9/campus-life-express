# CLX Production Deployment

Deploy the Vite `dist/` output to static hosting and the `clx-backend` Node service to a managed Node runtime. Use Supabase PostgreSQL as the managed database. This keeps the existing Vanilla JS frontend and Express API unchanged.

## Frontend

Build with `npm run build`. Serve `dist/` from static hosting or from a reverse proxy that forwards `/api/v1/*` to the backend. Set `VITE_API_BASE_URL=/api/v1` for that same-origin model. If the frontend and backend have separate HTTPS origins, set `VITE_API_BASE_URL` to the backend's HTTPS `/api/v1` URL at build time and set the backend `FRONTEND_URL` to the static site's exact HTTPS origin.

## Backend

Run `npm start` from `clx-backend`. The service reads its platform-assigned `PORT`, requires a database connection before accepting production traffic, and exposes `GET /api/v1/health` for liveness/readiness checks.

Set deployment secrets outside Git: `NODE_ENV`, `PORT`, `DATABASE_URL`, `DATABASE_SSL_CA` where required, `SUPABASE_JWT_SECRET` or `JWT_SECRET`, `FRONTEND_URL`, Paystack settings, and SMTP settings. Do not set `RATE_LIMIT_DISABLED=true` in production.

## Provider Readiness

Use Paystack test credentials and a controlled SMTP test account in staging first. Configure the payment callback as `<backend-origin>/api/v1/payments/callback` and expose `<backend-origin>/api/v1/payments/webhook` only over HTTPS. The Paystack secret key verifies webhooks and must remain a backend deployment secret.