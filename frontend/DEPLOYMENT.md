# CLX Production Deployment

Deploy the Vite `dist/` output to static hosting and the `clx-backend` Node service to a managed Node runtime. Use Supabase PostgreSQL as the managed database. This keeps the existing Vanilla JS frontend and Express API unchanged.

## Frontend

Build with `npm run build`. Serve `dist/` from static hosting or from a reverse proxy that forwards `/api/v1/*` to the backend. Set `VITE_API_BASE_URL=/api/v1` for that same-origin model. If the frontend and backend have separate HTTPS origins, set `VITE_API_BASE_URL` to the backend's HTTPS `/api/v1` URL at build time and set the backend `FRONTEND_URL` to the static site's exact HTTPS origin.

## Backend

Run `npm start` from `clx-backend`. The service reads its platform-assigned `PORT`, requires a database connection before accepting production traffic, and exposes `GET /api/v1/health` for liveness/readiness checks.

Set deployment secrets outside Git: `NODE_ENV`, `PORT`, `DATABASE_URL`, `DATABASE_SSL_CA` where required, `SUPABASE_JWT_SECRET` or `JWT_SECRET`, `FRONTEND_URL`, Paystack settings, and SMTP settings. Do not set `RATE_LIMIT_DISABLED=true` in production.

## Provider Readiness

Use Paystack test credentials and a controlled SMTP test account in staging first. Configure the payment callback as `<backend-origin>/api/v1/payments/callback` and expose `<backend-origin>/api/v1/payments/webhook` only over HTTPS. The Paystack secret key verifies webhooks and must remain a backend deployment secret.
---

# CLX Staging & Production Deployment Guide (Vercel → Render → Supabase)

Approved architecture:

```
USERS → VERCEL (frontend) → HTTPS /api/v1 → RENDER (backend)
                                               ├→ SUPABASE PostgreSQL
                                               ├→ PAYSTACK (payments)
                                               └→ EMAIL PROVIDER (SMTP)
```

## 1. Vercel (frontend)

| Setting | Value |
| ------- | ----- |
| Root Directory | `frontend` |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

Environment variables (Project → Settings → Environment Variables):

| Variable | Staging value | Notes |
| -------- | ------------- | ----- |
| `VITE_API_BASE_URL` | `https://<render-staging-host>/api/v1` | Set at build time. Local dev keeps the default `/api/v1` fallback (same-origin via Vite proxy). |

No `vercel.json` rewrites are required: CLX is a multi-page app with real `.html` files (Vercel serves `index.html` at `/` automatically). Do not add SPA rewrites — they would shadow the physical pages.

## 2. Render (backend)

| Setting | Value |
| ------- | ----- |
| Root Directory | `clx-backend` |
| Build Command | `npm install` |
| Start Command | `npm start` (runs `node src/index.js`) |
| Health Check Path | `/api/v1/health` |

The server binds to `process.env.PORT` (Render injects this automatically; default 3000 locally). Do not hard-code a port.

Render environment variables (names only — never commit values):

| Variable | Purpose | Staging | Production | Secret |
| -------- | ------- | ------- | ---------- | ------ |
| `NODE_ENV` | Runtime mode; gates production validation | `staging`/`development` | `production` | No |
| `PORT` | Listen port (Render-provided) | Auto | Auto | No |
| `DATABASE_URL` | Supabase Postgres connection string | Required | Required | **Yes** |
| `DATABASE_SSL_CA` | Supabase CA cert (optional; SSL enforced in production by default) | Optional | Optional | No |
| `SUPABASE_JWT_SECRET` or `JWT_SECRET` | JWT signing (required in production) | Required | Required | **Yes** |
| `FRONTEND_URL` | Exact HTTPS origin allowed by CORS | Vercel staging URL | Final domain | No |
| `PAYSTACK_SECRET_KEY` | Server-side Paystack API + webhook HMAC | Required (test key) | Required (live key) | **Yes** |
| `PAYSTACK_PUBLIC_KEY` | Public key (server-side consumers) | Required | Required | No |
| `PAYSTACK_CALLBACK_URL` | Redirect after checkout | `<backend>/api/v1/payments/callback` | Same | No |
| `PAYSTACK_API_BASE_URL` | Paystack API (default `https://api.paystack.co`) | Optional | Optional | No |
| `EMAIL_PROVIDER` | `stub` (default) or SMTP | `stub` ok | SMTP | No |
| `EMAIL_FROM` | From address | Optional | Required | No |
| `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_SECURE` | Transactional email | Optional | Required | SMTP_PASS **Yes** |
| `GAS_INTEGRATION_KEY` / `GAS_WEBHOOK_URL` / `GAS_WEBHOOK_SECRET` | Google Apps Script reporting integration | Optional | Optional | Key/Secret **Yes** |
| `AUTH_RATE_LIMIT_WINDOW_MS` / `AUTH_RATE_LIMIT_MAX` | Auth rate limiting | Optional (sane defaults) | Optional | No |
| `ORDER_RATE_LIMIT_WINDOW_MS` / `ORDER_RATE_LIMIT_MAX` | Order rate limiting | Optional | Optional | No |
| `PAYMENT_RATE_LIMIT_WINDOW_MS` / `PAYMENT_RATE_LIMIT_MAX` | Payment rate limiting | Optional | Optional | No |
| `RATE_LIMIT_DISABLED` | Dev-only limiter kill switch — **ignored in production by code** | Do not set | Do not set | No |
| `BUILD_PHASE` / `STRICT_DB_CHECK` | Build-time boot gating | Optional | Optional | No |

Production boot validation (in code): production requires `DATABASE_URL`, a JWT secret, and an `https://` `FRONTEND_URL` or startup fails. Development fallback secrets cannot leak into production.

## 3. Supabase (database)

Migrations live in `clx-backend/supabase/migrations/` (0001 → 0020, in order). They include:

- Extension: `pgcrypto` (required for `crypt()`/`gen_salt()` password hashing)
- Enums, reference tables, profiles/roles, vendors, catalog, services, marketplace, carts/orders/delivery, reviews/notifications/audit, functions/constraints/indexes, seed data, RLS + policies

Apply to a NEW staging database in numeric order (never run destructive SQL against existing data):

```
supabase db push            # if using Supabase CLI linked to the staging project
# or apply each file in order via the Supabase SQL editor / psql:
# 0001, 0002, ... 0020 (0001 must run first — it creates pgcrypto + enums)
```

Connection compatibility is already implemented in `src/config/database.js`: `pg` Pool (max 20), SSL with optional CA (`DATABASE_SSL_CA`), 2 s connect timeout, idle timeout, transactions via `withTransaction`, and graceful pool close on shutdown.

## 4. CORS

Backend `src/middleware/cors.js` allows only: no-origin requests (same-origin/proxy) and the exact origin in `FRONTEND_URL`. No wildcard, credentials enabled.

- Local: `FRONTEND_URL=http://localhost:5173` (Vite default)
- Staging: `FRONTEND_URL=https://<vercel-staging-project>.vercel.app`
- Production: `FRONTEND_URL=https://www.dandalinsauki.com` (or final domain)

The Vite dev proxy (backend embedded via `vite.config.js`) is unaffected.

## 5. API base URL strategy

| Environment | `VITE_API_BASE_URL` |
| ----------- | ------------------- |
| Local dev | `/api/v1` (default fallback, same-origin via Vite middleware) |
| Staging | `https://<render-staging-host>/api/v1` (set in Vercel env) |
| Production | `https://<production-api-host>/api/v1` (set in Vercel env) |

No URLs are hard-coded in application JavaScript.

## 6. Paystack webhook

- Route: `POST /api/v1/payments/webhook` (intentionally public, CORS-exempt by design)
- Verification: HMAC-SHA512 signature via `PAYSTACK_SECRET_KEY`, timing-safe compare, raw body preserved
- Staging endpoint to register: `https://<render-staging-host>/api/v1/payments/webhook`
- Callback: `PAYSTACK_CALLBACK_URL=https://<render-staging-host>/api/v1/payments/callback`
- The Paystack secret key exists only in the backend environment. Use Paystack **test** keys in staging. Do not register the production webhook until go-live.

## 7. Health check behavior

`GET /api/v1/health` returns:

- `200 {status: "ok", database: "connected"}` when DB is reachable
- `503` with degraded status when the database is unreachable (Render treats this as unhealthy — correct behavior; do not weaken it)

Recommended Render Health Check Path: `/api/v1/health`

## 8. Deployment sequence (staging)

1. Create staging Supabase project; apply migrations 0001→0020; note the connection string.
2. Deploy backend to Render: root `clx-backend`, start `npm start`, set all staging env vars (use Paystack test keys, `NODE_ENV=staging`), health path `/api/v1/health`.
3. Verify `https://<render-staging-host>/api/v1/health` → 200 `connected`.
4. Deploy frontend to Vercel: root `frontend`, framework Vite, set `VITE_API_BASE_URL=https://<render-staging-host>/api/v1`.
5. Set backend `FRONTEND_URL=https://<vercel-staging-url>` (redeploy backend).
6. Register Paystack test webhook → `<render-staging-host>/api/v1/payments/webhook`; set `PAYSTACK_CALLBACK_URL`.
7. Run the validation checklist below.

### Validation checklist

- [ ] Health: 200 + `database: connected`
- [ ] Public: `/api/v1/campuses`, `/categories`, `/products`, `/vendors` → 200
- [ ] Protected without token: `/cart`, `/orders`, `/deliveries`, `/notifications`, `/admin/stats` → 401
- [ ] Register/login works from the Vercel origin (CORS + JWT)
- [ ] Cart add/update/remove → order create → Paystack test payment → webhook received → order `PAID`
- [ ] Multi-page navigation works on Vercel (`/`, `about.html`, `food.html`, `marketplace.html`, …)
- [ ] Paystack webhook signature verification rejects unsigned requests

### Rollback considerations

- Vercel: instant rollback via dashboard deployments.
- Render: rollback to previous deploy; backend is stateless.
- Database: migrations are additive-forward; never roll back data — restore from Supabase PITR/backup if needed.
- Frontend/backend can be rolled back independently.
