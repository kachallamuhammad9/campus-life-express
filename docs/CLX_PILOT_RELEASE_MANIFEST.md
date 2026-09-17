# CLX Pilot Release Manifest

Release: CLX UNIMAID Pilot

Production: https://clx.dandalinsauki.com

## Production Architecture

The production website is the Vite multi-page frontend in `frontend/`, deployed to the existing Vercel CLX project. Browser code uses the public Supabase URL and anon key only; canonical ordering, lifecycle, payment, and administration state is enforced by the linked Supabase project through RLS and RPCs. The legacy Express backend is not part of the current frontend production path.

## Production Source

- `frontend/*.html` — public, account, orders, and admin pages.
- `frontend/js/` — Supabase client, authentication, catalogue, cart, checkout, customer orders, and administration modules.
- `frontend/css/` and `frontend/images/` — runtime styling and product/brand assets.
- `frontend/vercel.json`, `frontend/vite.config.js`, and `frontend/package*.json` — deployment/build configuration.

## Canonical Database Migrations

Canonical migrations are in `supabase/migrations/`. The production-aligned chain currently ends at:

- `20260917143000_remove_delivery_zone_checkout_requirement.sql`

The preceding UNIMAID delivery migration is:

- `20260917130000_unimaid_delivery_landmarks_flat_fee.sql`

All local migrations must be committed as source artifacts; migration contents must never be edited after application to production.

## Permanent Regression Tests

Retain the focused frontend suites for authentication, cart/checkout, customer orders, payment verification, cancellation, refunds, product availability, vendor orders, delivery operations, rider/admin operations, vendor applications, services, lifecycle controls, tracking, and operations read-only behavior. Test filenames beginning with `_` are not inherently temporary.

The backend `clx-backend/test/` suite remains a legacy/test-harness artifact and is not evidence that the legacy Express API is on the current production request path.

## Generated / Ignored Artifacts

`node_modules/`, `dist/`, build output, logs, local `.env*` files, Supabase CLI state, and `frontend/.vercel/` are excluded. The Vercel directory is local CLI/cache/browser-test state, not release source. Do not ignore migrations, `*.mjs`, generic image assets, documentation, or runtime configuration.

## Legacy Components

`clx-backend/` contains the older Express/Render/Paystack-oriented architecture, including its own package scripts, environment documentation, tests, and temporary investigation scripts. It remains in the repository for review only and is not removed by this pilot-freeze pass.

## Release Verification

Before release commit/review:

- run `npm run lint` and `npm run build` in `frontend/`;
- run retained non-mutating regression suites;
- verify `supabase migration list --linked` matches `supabase/migrations/`;
- inspect `git diff --check` and ensure every remaining path has an intended release classification.

Current local limitation: **BUILD VERIFICATION BLOCKED IN CURRENT SANDBOX — FILESYSTEM ACCESS RESTRICTION**. The sandboxed Vite/esbuild process cannot enumerate an ancestor outside the repository workspace; this is not recorded as a CLX repository build defect.

## Manual E2E Verification

Operator-confirmed flows: customer ordering/payment, multi-vendor pickup, multi-vendor delivery, cancellation, manual refund synchronization, product availability, Vendor E2E, Service Provider E2E, Rider & Delivery E2E, and admin responsive navigation/taps.

## Production Data

Repository cleanup makes no production-data changes.
