# Phase 4E.3 — local implementation and predeployment review

> Current decision: [final re-review passed](ADMIN_PRODUCT_FINAL_REVIEW.md).
> Older implementation/review notes below are historical. 0029 remains undeployed.

> Latest status: [blocker repairs verified — ready for re-review](ADMIN_PRODUCT_BLOCKER_REPAIR.md).
> The implementation and earlier review results below describe previous migration versions.

> Superseded by [the subsequent predeployment review](ADMIN_PRODUCT_PREDEPLOYMENT_REVIEW.md):
> **BLOCKED — DO NOT DEPLOY 0029**. That review reproduced validation defects
> despite the original passing suite. This document records the implementation-stage results.

0029 is LOCAL ONLY. Linked history was read on 2026-09-08: remote/local aligned
through 0028, only local 0029 pending, no 0030+. No product RPC was invoked in
production. No database push, SQL deployment, Vercel deployment or production DML
was performed. Production data mutations: **0**.

## Recovery and integrity

The interrupted worktree already contained both RPC bodies, the product module,
admin-page integration and a partial test suite. SQL was structurally present but
not compliant: client popularity, permissive prices/URLs, incomplete eligibility,
unknown patch keys, missing rename slugs and stock/concurrency gaps were corrected.
The existing admin.html integration was preserved. Unrelated worktree changes were
not reset. Historical migrations are untracked in this checkout; empty git diff
alone cannot prove integrity. Their SHA-256 values match the recovered test records:

| File | SHA-256 |
| --- | --- |
| 0026_vendor_applications.sql | e1a40bf919fd4b30889863329d738cf1d5097f80301f21e0d74caacaaad45749 |
| 0027_allow_unowned_vendors.sql | b80ea628feaf2831b956dcf661a4302af2ec0fceb5d01eb0a9b369fed327b8f3 |
| 0028_admin_vendor_application_review.sql | 3e9e5c02431e938e69fc441f19a575bd37ca1b535a0d11ef84367b5a9d68e486 |

## RPC contracts

Create accepts vendor/campus/root category, normalized name, bigint kobo price,
optional description/subcategory/original price/image URL/quantity and boolean
stock state. ID, slug, rating, review count, popularity and timestamps are server
controlled. Names collapse POSIX whitespace, preserve Unicode/punctuation and
allow 1–255 characters. Descriptions collapse whitespace to NULL when empty and
allow 2000 characters. Prices are 1–999999999 kobo; original price is nullable,
at least price and within the same ceiling. Stock is nullable/untracked or
0–1000000 (the recovered implementation's bound); zero forces out-of-stock and
positive quantities can remain manually out-of-stock. Image URLs use only
products.image_url, allow HTTP/HTTPS with a host, at most 2048 characters, and
normalize blank input to NULL. No storage bucket or product_images changes.

Update is admin_update_product(uuid,jsonb). Only the ten requested editable keys
are accepted, including strict JSON number/boolean/string validation. Absent keys
retain values; JSON null clears nullable fields. Required fields cannot be cleared.
jsonb_populate_record runs only after the key/type allowlist. Vendor/campus/ID and
server metadata cannot be patched, even with their existing value. Category changes
with an incompatible retained subcategory fail; explicitly clear or replace it.
No-op and identical patches return without updating timestamps. Historical order
tables are never written.

Both functions require auth.uid() and is_admin() IS TRUE, use SECURITY DEFINER
with pg_catalog, public, pg_temp and schema-qualified relations, revoke PUBLIC/anon
EXECUTE and grant authenticated/service_role EXECUTE. Service role does not bypass
the internal actor check. This follows the existing CLX RPC grant policy and
[Supabase function guidance](https://supabase.com/docs/guides/database/functions).

Both check active verified vendor, active campus and exact active vendor-campus
association with shared row locks. Update locks the target product. Category edits
require an active root and an optional active child. No authoritative commercial
vendor-to-product category permission mapping exists in this schema. The vendor's
category_id is a classification, not a mapping table: no guessed food/shopping
restrictions are introduced. Unchanged legacy field values are not revalidated
except eligibility; price and stock dependencies validate their final combined
state when either dependent field is patched.

## Concurrency and direct-write decision

Create/update acquire the same transaction advisory lock (429003) before any row
locks. This deliberately serializes low-volume admin product writes. Duplicate
checks normalize existing and input names and compare case-insensitively within
vendor/campus. Slugs use a normalized ASCII base or `product`, then -2, -3 etc.
Renames regenerate slugs. Existing UNIQUE(vendor_id,campus_id,name) and
UNIQUE(vendor_id,campus_id,slug) remain authoritative database constraints; unique
violations yield a clean refresh/retry error. No auto-merge or duplicate backfill.

The advisory protocol covers these RPCs. Privileged direct writers do not acquire
it automatically and should not run competing product writes. Real concurrent
multi-session tests remain a predeployment review item; PGlite is one connection.

0029 revokes INSERT/UPDATE/DELETE and TRUNCATE/REFERENCES/TRIGGER on products from
PUBLIC, anon and authenticated. It drops products_owner_insert/update/delete,
which formerly authorized both vendor owners and admins. SELECT grants and the
existing products_select_public policy remain intact. Read-only production
inspection found no explicit column ACLs (pg_attribute.attacl), so there are no
column-level grants bypassing the table revocation. Service-role table grants
remain unchanged. The current MVP has no vendor self-management; a future portal
must introduce separately authorized owner RPCs before re-enabling any write path.
No DELETE RPC or Delete UI exists; Mark Out sets is_in_stock=false.

## Frontend and verification

admin-products.js remains separate from operations/vendor-application modules.
The recovered admin.html initializes it after authorization and resets it on
sign-out. Vendor/campus selectors, category/subcategory filters, search, stock
filter, refresh, Add, Edit and stock actions are present. Edit shows immutable
vendor/campus text, emits only changed keys and sends explicit nulls when cleared.
Money conversion rejects malformed amounts and more than two fractional digits.
Failed mutations keep the form; success reloads authoritative products. Modal
focus is contained and the underlying section becomes inert. Stale async reads
and mutation results are discarded after reset. Fetch errors are shown rather
than misreported as an empty catalogue.

Two recovered production verification scripts failed existing read-only tests:
scripts/verify_phase4e1.mjs and scripts/verify_phase4e1_v2.mjs. Their mutation/RPC
probes were removed locally. Neither script was run against production.

Final checks: 16 frontend suites exit 0; 532 numerically counted checks plus the
existing vendor-application browser integration suite (which prints one summary
without a numeric assertion total). This exceeds the supplied 414 baseline;
the totals here are derived from current suite output, not by adding to 414.

| Suite | Passing checks |
| --- | ---: |
| Admin auth | 25 |
| Product SQL/module | 112 |
| Product browser | 8 |
| Cart | 21 |
| Legacy API cleanup | 7 |
| Live catalogue safety | 6 |
| Operations read-only | 24 |
| Payment verification | 21 |
| Phase 1 live mocks | 3 |
| Phase 1 | 19 |
| Customer orders/checkout | 11 |
| Vendor application admin | 75 |
| Vendor onboarding | 122 |
| Vendor order operations | 54 |
| Vendor ownership | 24 |

`npm.cmd run lint` and `npm.cmd run build` pass in frontend. The first sandboxed
build hit an esbuild parent-directory access restriction; the authorized local
build retry passed. No deployment occurred. Test logs and a visually inspected
product modal screenshot are under frontend/.vercel (excluded from public build).
SQL tests require the existing .vercel/phase4e2-sql-tools PGlite dependency and
fail rather than silently skip if absent. Browser tests require the existing
Playwright tooling and cached Chromium or CLX_TEST_CHROME.

## Production read-only evidence

Counts before/final: products 44, services 23, vendors 14, vendor_campuses 19,
user_roles 24. Synthetic vendor 04d707b1-c1d9-45d8-a12d-032c374fd5a5:
products 0, services 0, owner_user_id NULL. Whole-row MD5 fingerprints from
to_jsonb(row)::text matched across checks:

| Protected row | Status | Fingerprint |
| --- | --- | --- |
| CLX-VA-2026-0001 | PENDING | f36a51823f10e257b3f4b76865475f9d |
| CLX-VA-2026-0002 | PENDING | 2228351299fac966ff868a506ff04435 |
| CLX-VA-2026-0003 | APPROVED | 7c98ea9a277c082a3238c6132618a189 |
| Synthetic vendor | owner NULL | dd57e575e3fd0c15431c0920897e4ba4 |

Recommendation: PASS WITH NON-BLOCKING NOTES — READY FOR 0029 PREDEPLOYMENT
REVIEW. Review real multi-session concurrency and production-specific PostgREST
integration at the next authorized gate. Do not deploy automatically.
