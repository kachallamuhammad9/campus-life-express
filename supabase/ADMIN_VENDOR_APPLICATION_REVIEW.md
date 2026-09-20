# Phase 4E.2 implementation and review notes

Local only: 0028 has not been executed against Supabase. Do not use the protected
production smoke application for development or approval testing.

## Schema mapping through 0027

The required vendor fields in 0004 can all be supplied after 0027:

| Vendor column | Source |
| --- | --- |
| owner_user_id | NULL, no login/account provisioning |
| name | trimmed application.business_name |
| slug | clx-vendor- plus digest of namespaced application ID |
| category_id | existing active category by exact category_slug; food/shopping only |
| location | trimmed application.location |
| phone_number | strict Nigerian normalization of application.phone_number |
| email, description | application values |
| status, is_verified | ACTIVE, true, determined by approval RPC |
| id, timestamps, rating, review_count | existing database defaults |
| legacy_key, image_url | existing NULL defaults |

vendor_campuses uses its existing (vendor_id, campus_id) primary key; application
campus_id, not campus_slug, selects the one active campus. No categories are created.
Existing vendor rows are never updated by approval, including their owner/status.

## Review and security

Both RPCs require auth.uid() and is_admin() IS TRUE, use SECURITY DEFINER and
pg_catalog, public, pg_temp search_path. They lock the application before mutation.
PUBLIC/anon execution is revoked; authenticated/service_role execution is granted,
but the internal actor/admin check still applies. No dynamic SQL or client actor.

0028 removes the legacy admin direct application UPDATE policy/grant so the review
transition allowlist cannot be bypassed through a browser table update. Existing
admin SELECT remains. No vendor/vendor-campus table grant is added. Existing
vendor admin policies remain outside this narrowly scoped change.

Review text is trimmed and bounded to 2000 characters. A supplied nonblank review
note replaces the current note; omitted notes preserve it. Rejection requires a
reason. Other review transitions clear rejection_reason. Approval preserves notes.

## Duplicate handling, locks and idempotency

Approval locks the application, then takes one transaction advisory lock shared by
all approval calls. This intentionally serializes low-volume admin approvals so
two applications cannot race the identity lookup. Campus/category rows are held
FOR SHARE, explicitly linked vendor rows FOR UPDATE. No other application row is
locked by approval. Multi-connection concurrency still needs deployment validation;
the in-memory test engine executes on one connection.

An existing vendor_id is accepted only with exact normalized business name and
phone, category, location, ACTIVE status and verified flag. Without an explicit
link, an exact name, normalized contact or generated slug collision fails closed
for manual resolution. Similar names never trigger automatic linking. This can
intentionally block unrelated businesses sharing contact details. No manual-link
RPC is introduced in this phase.

The deterministic slug is an opaque digest, not the raw internal application UUID.
The existing slug UNIQUE constraint rejects collisions; collisions never authorize
a merge. The advisory lock covers these RPCs, not unrelated privileged writers;
do not run competing direct administrative vendor-creation workflows during approval.

Campus insertion uses ON CONFLICT DO NOTHING. Existing inactive relations fail
closed, rather than being silently activated. Finalization is the last write. A
failure rolls back vendor creation, association insertion and application changes.

APPROVED retries validate the vendor and active campus/category/association before
returning a zero-write success. A later suspended/edited vendor or inactive campus
requires manual resolution rather than silent repair. The result contains only
application number, vendor name, status and already_approved, no internal UUIDs.

## Local tests

Run from frontend: node _vendor_application_admin_tests.mjs.
The suite checks source contracts, wrapper behavior and status action mapping.
If the isolated PGlite dependency is installed, it also executes real 0026–0028 SQL
on an in-memory database using the original vendor/reference schema and a fixture
matching the legacy application schema described by 0026. Auth identity is mocked;
is_admin uses the actual helper implementation. No network or credentials are used.

Install test engine outside the public build if needed:
`npm install --prefix .vercel/phase4e2-sql-tools --ignore-scripts @electric-sql/pglite`.
The PostgreSQL checks explicitly report a skip if it is absent. They cover the
full review matrix, auth/ACL, mapping, duplicate rejection, explicit-link reuse,
idempotency, inconsistent links/campuses, slug collisions and transaction rollback.

`_vendor_application_admin_browser_tests.mjs` uses isolated existing Playwright
tooling and CLX_TEST_CHROME (or the local cached Chromium path). It serves the actual
admin page on loopback, mocks auth and Supabase, blocks external requests and checks
actions, confirmation, authoritative refresh, hidden IDs and sign-out clearing.
It does not validate production PostgREST relationships or real authentication.

Next gate is predeploy review, not deployment. No products, services, profiles,
auth users, roles, orders or payments are created or modified by 0028's RPCs.
