# CLX Pilot Release Staging Plan

## Release Identity

CLX UNIMAID Pilot

## Base Commit

Current HEAD: `4c65cfbfd8b3bede7de0f38d0b54e8199335d7d6`.

## Required Production Source

Stage the complete current Vite frontend source and direct runtime dependencies:

- `.gitignore`
- `frontend/about.html`
- `frontend/account.html`
- `frontend/admin.html`
- `frontend/categories.html`
- `frontend/contact.html`
- `frontend/delivery.html`
- `frontend/food.html`
- `frontend/index.html`
- `frontend/marketplace-rules.html`
- `frontend/marketplace.html`
- `frontend/orders.html`
- `frontend/privacy.html`
- `frontend/sell.html`
- `frontend/services.html`
- `frontend/shopping.html`
- `frontend/terms.html`
- `frontend/vendor-onboarding.html`
- `frontend/vendors.html`
- `frontend/forgot-password.html`
- `frontend/login.html`
- `frontend/reset-password.html`
- `frontend/signup.html`
- `frontend/css/main.css`
- `frontend/css/admin.css`
- `frontend/images/BOSU LOGO.png`
- `frontend/images/UNIMAID LOGO.jpg`
- `frontend/images/clx.png`
- `frontend/images/service-placeholder.svg`
- `frontend/public/robots.txt`
- `frontend/public/sitemap.xml`
- `frontend/js/admin-auth.js`
- `frontend/js/admin-products.js`
- `frontend/js/admin-lifecycle.js`
- `frontend/js/admin-services.js`
- `frontend/js/api.js`
- `frontend/js/app.js`
- `frontend/js/auth.js`
- `frontend/js/catalogue.js`
- `frontend/js/customer-orders.js`
- `frontend/js/data.js`
- `frontend/js/operations.js`
- `frontend/js/order-refunds.js`
- `frontend/js/service-catalogue.js`
- `frontend/js/services-page.js`
- `frontend/js/supabase.js`
- `frontend/js/vendor-applications-admin.js`
- `frontend/js/vendor-onboarding.js`

Stage the frontend build/deployment configuration:

- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/vite.config.js`
- `frontend/vercel.json`
- `frontend/tsconfig.json`
- `frontend/.env.example`
- `frontend/README.md`
- `frontend/DEPLOYMENT.md`

## Canonical Migrations

Stage all production-applied canonical migrations that are currently untracked:

- `supabase/migrations/0024_verify_customer_order_payment.sql`
- `supabase/migrations/0025_admin_advance_vendor_order.sql`
- `supabase/migrations/0026_vendor_applications.sql`
- `supabase/migrations/0027_allow_unowned_vendors.sql`
- `supabase/migrations/0028_admin_vendor_application_review.sql`
- `supabase/migrations/0029_admin_product_management.sql`
- `supabase/migrations/0030_admin_service_management.sql`
- `supabase/migrations/0031_fulfillment_delivery_operations.sql`
- `supabase/migrations/0032_fix_tracking_crypt_schema.sql`
- `supabase/migrations/0033_customer_order_payments_customer_select.sql`
- `supabase/migrations/0034_admin_lifecycle_management.sql`
- `supabase/migrations/0035_lifecycle_dependency_details.sql`
- `supabase/migrations/20260916124502_fix_delivery_transit_timeline.sql`
- `supabase/migrations/20260916134345_admin_unpaid_order_cancellation.sql`
- `supabase/migrations/20260916140443_enforce_product_availability_at_checkout.sql`
- `supabase/migrations/20260917094632_paid_order_manual_refunds.sql`
- `supabase/migrations/20260917130000_unimaid_delivery_landmarks_flat_fee.sql`
- `supabase/migrations/20260917143000_remove_delivery_zone_checkout_requirement.sql`

## Permanent Regression Tests

Stage the safe runner and all 28 scripts it references:

- `frontend/tests/run-regression.mjs`
- `frontend/tests/README.md`
- `frontend/_admin_auth_tests.mjs`
- `frontend/_admin_lifecycle_tests.mjs`
- `frontend/_admin_order_operations_mvp_tests.mjs`
- `frontend/_admin_product_management_tests.mjs`
- `frontend/_admin_rider_error_tests.mjs`
- `frontend/_admin_service_management_tests.mjs`
- `frontend/_cart_tests.mjs`
- `frontend/_customer_order_hardening_tests.mjs`
- `frontend/_customer_payment_visibility_tests.mjs`
- `frontend/_customer_progress_tracker_tests.mjs`
- `frontend/_fulfillment_delivery_operations_tests.mjs`
- `frontend/_legacy_api_cleanup_tests.mjs`
- `frontend/_live_catalogue_safety_tests.mjs`
- `frontend/_live_services_catalogue_tests.mjs`
- `frontend/_my_orders_display_tests.mjs`
- `frontend/_operations_readonly_tests.mjs`
- `frontend/_order_cancellation_hardening_tests.mjs`
- `frontend/_payment_verification_tests.mjs`
- `frontend/_phase1_live_tests.mjs`
- `frontend/_phase1_tests.mjs`
- `frontend/_phase3_customer_orders_tests.mjs`
- `frontend/_phase4g_pickup_first_tests.mjs`
- `frontend/_product_availability_hardening_tests.mjs`
- `frontend/_unimaid_delivery_checkout_tests.mjs`
- `frontend/_vendor_application_admin_tests.mjs`
- `frontend/_vendor_onboarding_tests.mjs`
- `frontend/_vendor_order_operations_tests.mjs`
- `frontend/_vendor_ownership_tests.mjs`

The following permanent local-infrastructure test sources are recommended for staging but are deliberately excluded from the safe default runner:

- `frontend/_admin_product_postgrest_review.mjs`
- `frontend/_admin_product_predeployment_review.mjs`
- `frontend/_admin_service_postgrest_tests.mjs`
- `frontend/_fulfillment_delivery_runtime_tests.mjs`
- `frontend/_manual_refund_runtime_tests.mjs`
- `frontend/_tracking_crypt_runtime_tests.mjs`

The following browser/live/diagnostic scripts are individually reviewed tools,
not part of the permanent safe regression set, and are excluded unless a later
release explicitly promotes one:

- authentication diagnosis/baseline scripts;
- browser QA scripts;
- PostgREST review scripts;
- payment smoke scripts;
- production/live catalogue and product smoke scripts;
- `_qa_*.mjs` tools and one-off phase verification scripts.

## Documentation

Stage the current maintenance and release documents:

- `frontend/README.md`
- `frontend/DEPLOYMENT.md`
- `docs/CLX_CURRENT_ARCHITECTURE.md`
- `docs/CLX_PILOT_RELEASE_MANIFEST.md`
- `docs/CLX_PILOT_RELEASE_STAGING_PLAN.md`

Recommended pilot maintenance documentation:

- `docs/CLX_CONTROLLED_UNIMAID_PILOT_PLAN.md`
- `docs/CLX_DAILY_OPERATIONS_SOP.md`
- `docs/CLX_FIRST_REAL_CUSTOMER_RUNBOOK.md`

## Configuration

Stage only safe configuration and templates:

- `frontend/package.json` — includes `test:regression`
- `frontend/package-lock.json` — frontend dependency lockfile
- `frontend/vite.config.js` — Vite multi-page build configuration
- `frontend/vercel.json` — existing route/deployment behavior
- `frontend/tsconfig.json` — lint/typecheck configuration
- `frontend/.env.example` — placeholder-only public frontend variable names

Do not stage `frontend/.gitignore`; its removal of the `.vercel` ignore entry is not needed because the root ignore rules retain that protection.

## Explicit Exclusions

- Environment files, credentials, and local Supabase/Vercel state: `.env*` except the approved example, `frontend/.vercel/`, `supabase/.branches/`, `supabase/.temp/`, and `.qa/`.
- Generated output and local dependencies: `node_modules/`, `frontend/dist/`, logs, coverage, cached browser tooling, and `vite-*.log`.
- Root `package.json` and `package-lock.json`; these are not the frontend deployment package.
- `frontend/.env`, `frontend/.env.local`, and `frontend/.env.production`; these contain local or deployment values.
- `frontend/frontend/` generated screenshot/output directory, if present.
- `frontend/metadata.json`, `frontend/bun.lock`, `frontend/npm-build-out.txt`, and `frontend/vite-qa.*`; these are not part of the current npm/Vite production contract.
- One-off root `scripts/`, `verify_phase4e1_v2.mjs`, and `supabase/qa/` artifacts.
- Historical or stale operational reports in `docs/` and `supabase/*.md` that are not listed above.
- Browser, live, production-mutating, and diagnostic scripts: `_admin_auth_baseline_readonly.mjs`, `_admin_auth_browser_diagnosis.mjs`, `_admin_auth_diagnosis.mjs`, `_admin_dashboard_browser_qa.mjs`, `_admin_lifecycle_availability_browser_tests.mjs`, `_admin_product_browser_tests.mjs`, `_admin_service_browser_tests.mjs`, `_vendor_application_admin_browser_tests.mjs`, `_payment_smoke_first_qa.mjs`, `_payment_smoke_idempotency_qa.mjs`, `_product_smoke_audit_readonly.mjs`, `_production_product_smoke.mjs`, `_qa_admin.mjs`, `_qa_ops_dashboard.mjs`, and `_qa_run.mjs`.
- `clx-backend/scripts/` legacy/untracked backend artifacts.

The untracked `clx-backend/` additions are classified **LEGACY — EXCLUDE**;
the current production request path is the Vite frontend plus Supabase.

## Validation

- Regression: 28/28 expected from `npm run test:regression`.
- Lint: PASS expected from `npm run lint`.
- Build: PASS in the current validation run.
- Migration parity: local and linked production migration histories must match before staging.

## Production Deployment

NO DEPLOYMENT IS PART OF THIS RELEASE-FREEZE COMMIT PREPARATION.
