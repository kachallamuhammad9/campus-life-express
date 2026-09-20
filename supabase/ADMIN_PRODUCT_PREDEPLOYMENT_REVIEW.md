# Phase 4E.3 — 0029 predeployment review

> Historical review of the earlier migration hash. Its blockers have since been
> repaired locally; see [repair evidence](ADMIN_PRODUCT_BLOCKER_REPAIR.md).
> The repaired migration requires re-review and has not been deployed.

**BLOCKED — DO NOT DEPLOY 0029**

Reviewed 2026-09-08. Production data mutations: **0**. The reviewed migration
was not edited or deployed. SHA-256:
`e2d80a0fef48d66cf52e9c3b937184184910d7dfd7d79488c7d9d634b278a216`.
This review supersedes the earlier readiness recommendation.

## Reproduced blocking findings

1. **Valid subcategories cannot be used on create** (0029 line 136).
   The query requires `parent_id = p_category_id` AND `parent_id IS NULL`.
   A fixture with an active root and an active child fails with the subcategory
   validation error. Remove the contradictory root-only predicate from the child
   lookup in a subsequent correction. Add a successful-create-with-child regression.
   Existing rejection tests could not catch this; all original 112 checks pass.

2. **Final price invariant is conditional** (0029 line 300).
   On an isolated fixture seeded with `price_kobo=0` (allowed by the existing table
   CHECK), updating only description succeeds and returns zero price. Validation
   only runs when a price key occurs. This violates this review's requirement that
   the final row after any successful update always has a positive bounded price.
   This was compatible with the earlier instruction to validate only changed
   values, but it does not satisfy the stronger predeployment requirement.
   Production read-only inspection found zero products outside the requested price
   range. The four requested price-patch interactions themselves pass.

3. **Image URL host validation is insufficient** (0029 lines 96 and 287).
   Actual SQL accepts `https://:80/a` and `https://user@/a`, which have no hostname.
   The authority regex permits colon and user-info characters without requiring a
   host. Frontend URL parsing rejects these, but authenticated RPC callers can
   bypass frontend validation. Correct both RPC checks before deployment.

No fixes were applied to 0029 during this review.

## Migration history and accepted history

`supabase migration list --linked` passed: aligned through 0028; only local 0029
pending; no 0030+. 0026–0028 hashes match the accepted implementation report:

| Migration | SHA-256 |
| --- | --- |
| 0026 | e1a40bf919fd4b30889863329d738cf1d5097f80301f21e0d74caacaaad45749 |
| 0027 | b80ea628feaf2831b956dcf661a4302af2ec0fceb5d01eb0a9b369fed327b8f3 |
| 0028 | 3e9e5c02431e938e69fc441f19a575bd37ca1b535a0d11ef84367b5a9d68e486 |

The entire migration contains only the two product RPCs and product grants/policies.
No helper creation, services, storage, product_images, applications, auth, roles,
orders or payment schema changes. Existing owner read helpers remain intact.

## Exact signatures

```sql
public.admin_create_product(
  p_vendor_id uuid,
  p_campus_id uuid,
  p_category_id uuid,
  p_name text,
  p_price_kobo bigint,
  p_description text default null,
  p_subcategory_id uuid default null,
  p_original_price_kobo bigint default null,
  p_image_url text default null,
  p_is_in_stock boolean default true,
  p_stock_quantity integer default null
) returns jsonb

public.admin_update_product(p_product_id uuid, p_patch jsonb) returns jsonb
```

Both use SECURITY DEFINER, schema-qualified relations, pg_catalog/public/pg_temp,
auth.uid() and is_admin() IS TRUE. PUBLIC/anon EXECUTE is revoked; authenticated
and service_role execution grants match the previous CLX policy. Service-role
grant does not remove the actor check. Server metadata and vendor/campus identity
are not writable patch keys. Unknown keys and invalid JSON types fail closed.

## Native PostgreSQL and actual concurrency

An existing PostgreSQL 18.6 installation was used to initialize a NEW disposable
cluster under frontend/.vercel/phase4e3-review/pgdata, listening ONLY on
127.0.0.1:55439. No existing local database or production database was modified.
The runner uses fixed local connection settings and does not read environment
database URLs. It reused the original 112 assertions on native PostgreSQL and
added 15 review checks: **11 pass, 4 fail** (the three findings above include two
malformed URL examples).

Each concurrency test uses TWO independent node-postgres Client connections.
Connection A holds an uncommitted transaction after its RPC. Connection B sends
the competing RPC. A third observer checks pg_stat_activity to prove B is waiting
on a database lock before A commits. These are overlapping real transactions,
not sequential PGlite calls. Default READ COMMITTED isolation was used.

| Test | Actual behavior |
| --- | --- |
| Same normalized product | A commits; B returns clean duplicate-name error; one row |
| Colliding slug bases | Both succeed; concurrent-slug and concurrent-slug-2; separate IDs |
| Conflicting rename | A commits rename; B returns clean duplicate-name error; B's old name remains |

All three PASS. Transaction advisory lock 429003 is acquired before row locks.
Existing raw-name and slug UNIQUE constraints remain authoritative, with clean
unique-violation handling. Name normalization/case folding is enforced by the RPC
under its advisory protocol; the raw-name UNIQUE constraint alone is not a
normalized-name unique index. Privileged direct writers do not follow this
protocol automatically. No merge or overwrite occurs.

## Real PostgREST transport

Used official Windows PostgREST **16.2** on 127.0.0.1:55440 against the same
disposable native cluster. Official binary distribution is documented at
https://docs.postgrest.org/en/stable/explanations/install.html .
The server ran hidden and was stopped by the test runner. Locally generated JWTs
used a temporary signing secret, a restricted authenticator role, real role
switching, and auth.uid() reading request.jwt.claims. No production keys were used.

The actual frontend adminCreateProduct/adminUpdateProduct wrappers were called
with the installed Supabase PostgrestClient. This uses real HTTP/PostgREST RPC
requests with the same named JSON payloads, not a mocked RPC or direct SQL proxy.
Native PostgREST uses /rpc without the Supabase gateway's /rest/v1 prefix.

**7/7 PASS**: create UUID/bigint/default nullable fields/boolean; update JSONB
integers/text/boolean; absent nullable keys preserved; all four explicit JSON
nulls cleared; protected/unknown keys rejected; anon/non-admin denied; direct
HTTP INSERT/UPDATE/DELETE denied while permitted SELECT succeeds.

## Validation and compatibility

- Names: NULL/empty/spaces/control whitespace rejected; repeated whitespace
  collapsed; Unicode/punctuation preserved; 255-character bound tested.
- Description: nullable, whitespace normalized, 2000-character Unicode boundary.
- Vendor/campus: authoritative active verified vendor, active campus and exact
  active association checked on create/update. Vendor/campus cannot be patched.
- Category: root hierarchy checks and update checks are sound; create child check
  is blocked as above. No guessed business mapping or Food/Shopping/Services allowlist.
- Price cases A–D pass: lower price retains original, raising beyond retained
  original rejects, clearing original with price change succeeds, simultaneous
  price/original patches validate the final combined values.
- Stock one-key interactions pass: quantity zero forces false; true with retained
  zero remains false; positive quantity preserves manually false; NULL clears
  tracking. Bound is 0–1000000. Like prices, stock checks run only when a stock
  field is patched; unrelated edits do not repair inconsistent legacy stock.
- HTTP/HTTPS scheme, length, blank and ordinary invalid URL checks pass, but the
  hostname-less examples above are accepted by the SQL validator.
- Write grants: INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER revoked from
  PUBLIC/anon/authenticated. Production had no explicit column-level ACLs.
- Public products_select_public is unchanged. Native anon tests show visible
  active-vendor in-stock products, hide out-of-stock rows and hide inactive-vendor
  rows. Actual HTTP public reads also work. Owner/admin SELECT branches preserved.
- Owner direct-write policy removal is intentional for the current MVP. Future
  vendor self-management requires explicit authorized RPC/RLS architecture.
- 0029 does not touch order_items, snapshots, checkout or payment functions.
  0022 create_customer_order still reads authoritative price/stock/vendor-campus
  state and detects stale client prices; historical order snapshots remain protected.
- Frontend product writes use only the two RPCs. Strict Naira conversion passes
  all requested valid/invalid examples. Browser checks verify no render/filter
  writes, immutable edit identity, no Delete button, failed create/update form
  preservation and authoritative reload on success.

## Test, build and secret results

Original 16 regression suites: **532 counted checks PASS**, plus the existing
vendor-admin browser integration summary. Product suite **112/112**; product
browser expanded **8/8 -> 10/10**, bringing regression counted checks to **534**.
Vendor admin **75/75**, ownership **24/24**; cart/catalogue/customer-order/payment/
vendor-operation/admin-auth checks all pass. These totals do not hide the separate
four failing native review checks. The additional PostgREST checks are **7/7**.

`npm.cmd run lint` and `npm.cmd run build` PASS. No Vercel deployment.
Build scanner checked 33 output files against 3 locally available private values,
private-token/key/connection-string patterns and JWT roles: **0 findings**.
No secret values were printed. This is a bounded scan, not proof against every
possible unknown secret. Only public Supabase configuration is expected in assets.

Review artifacts:
- frontend/_admin_product_predeployment_review.mjs (native runner, use a fresh cluster)
- frontend/_admin_product_postgrest_review.mjs (real transport runner)
- scripts/scan_product_review_build.py
- frontend/.vercel/phase4e3-review/ (ignored runtime binaries, data and logs)

## Production read-only evidence

Before/final counts: products 44, services 23, vendors 14, vendor_campuses 19,
user_roles 24, vendor_applications 3. Synthetic vendor remains owner NULL with
zero products and zero services. No live product RPC was called.

| Protected record | Status | Unchanged row fingerprint |
| --- | --- | --- |
| CLX-VA-2026-0001 | PENDING | f36a51823f10e257b3f4b76865475f9d |
| CLX-VA-2026-0002 | PENDING | 2228351299fac966ff868a506ff04435 |
| CLX-VA-2026-0003 | APPROVED | 7c98ea9a277c082a3238c6132618a189 |
| Synthetic vendor | owner NULL | dd57e575e3fd0c15431c0920897e4ba4 |

## Recommendation

Correct the three validation defects locally, add successful child-category and
negative host/legacy-final-state regression cases, then repeat review against the
new migration hash. Concurrency and real PostgREST are verified for this reviewed
version, but do not override the blocking validation failures. Do not deploy.
