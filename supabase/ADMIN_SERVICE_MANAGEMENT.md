# Phase 4E.4 — Local Steps 3 and 4

Status: implementation and local tests passed; migration 0030 is NOT deployed.
Production remains through 0029. No production service smoke test or frontend deployment was performed.

## Migration

`0030_admin_service_management.sql` SHA-256:
`3fd49d86d75cc2f45888316a591105f06f4e407ede40826db3e278af460fe9a3`

- Makes services.provider_user_id nullable; existing values remain unchanged. At least vendor_id or provider_user_id must exist.
- Adds partial vendor/campus normalized-name and slug unique indexes for vendor-backed services. Old provider/campus constraints remain authoritative too.
- Adds admin_create_service and admin_update_service, with auth.uid/is_admin gates, SECURITY DEFINER, hardened search paths, authenticated/service_role EXECUTE and PUBLIC/anon revocation.
- Private URL, final-state validation and slug helpers have no API-role EXECUTE grants. The product helper is untouched.
- A single service advisory lock precedes row locks, serializing cooperating mutations; unique indexes protect against independent competing writes.
- Provider derives from vendor.owner_user_id, never the acting admin. Default RPC availability is false; the legacy table default is unchanged.
- New services and ordinary edits require active verified vendor, active campus/pair, active Services root, valid child, pricing and HTTP(S) URL. Updates preserve absent keys and explicitly clear nullable keys with JSON null.
- The exact patch {"is_active":false} is the only legacy-validation exception. No incidental repair occurs. Ordinary edits cannot retain invalid final context.
- Removes dormant provider write policies and all direct browser write/TRUNCATE/REFERENCES/TRIGGER grants; retains SELECT.
- Public RLS requires full eligibility. Admin/provider/vendor-owner inspection branches intentionally remain. A future public catalogue implementation must explicitly filter full public eligibility even in a signed-in owner's browser.
- Extends the existing vendor approval function to active root services, alongside food/shopping. Logistics remains rejected; no Auth account or service is created by approval.
- Makes request context comparisons NULL-safe and clearly rejects new requests for providerless services. service_requests.provider_user_id and historical rows are unchanged.

URL limitations match products: DNS/punycode and strict IPv4 supported; raw Unicode hosts, userinfo and IPv6 are deliberately unsupported. Maximum 2048 characters, HTTP(S), valid host/port and percent escapes required.

No top-level application-data INSERT/UPDATE/DELETE, backfill or cleanup exists in 0030. DML inside RPC definitions runs only when invoked later. Function replacement does not execute approval.

## Read-only production preflight

45 products, 23 services, 14 vendors, 19 vendor-campus associations, 3 applications, 6 service requests. Zero vendor/campus normalized-name duplicates and zero slug duplicates. Index creation will independently fail closed if this changes before deployment.

Service fingerprint: `89ab110e21bdfd6bed7617d65e3d7911`.
Historical request fingerprint (ordered by id): `f30b9bfebf66de846b0869b1d1b2663c`.

Earlier audit: 10 legacy category mismatches and 5 inactive-campus services. No rows were corrected. Full public eligibility currently admits 13 services. Review this intended visibility change before deployment.

Historical migrations 0026/27/28 match accepted hashes; 0029 still hashes to `4022ff9a11628b8941803e72891d4151c16b7d546c5a765c3eaa6e4596246f77`.

## Frontend

`frontend/js/admin-services.js` integrates into the authenticated admin shell with init/reset lifecycle. Uses only the two service RPCs for mutations. Safe DOM text/attribute creation; no database strings enter innerHTML. Vendor/campus are immutable on edit and provider is not exposed as an editable field. Nullable fields are patched only when their displayed inputs change. Filters are read-only, failures retain forms and successful mutations trigger authoritative refresh. Legacy-invalid rows have context warnings and can be quarantined.

`services.html`, the static public catalogue, and the retired booking/request path were intentionally NOT changed. Product/order/payment modules are untouched.

## Validation results

- Service PGlite suite: 91/91.
- Native PostgreSQL 18 suite: 94/94, including independent-connection same-name, slug-collision and rename-conflict tests.
- Real isolated PostgREST: 14/14.
- Service browser suite: 14/14; all external requests blocked.
- Existing regression: 595 counted checks, plus existing vendor-application admin browser integration summary, all passing.
- Combined counted frontend/PGlite gate: 700 checks (595 + 91 + 14). Native and PostgREST results are reported separately, not double-counted.
- Vendor admin: 75/75; ownership: 24/24; product suite: 173/173; product browser: 10/10.
- Lint and build passed. Build required normal filesystem access outside the restricted sandbox for esbuild.
- Secret scan: 33 build files, four configured private values checked, zero findings. No values logged.

Tests: `node frontend/_admin_service_management_tests.mjs`, `node frontend/_admin_service_browser_tests.mjs`.
Native test prerequisites: disposable PostgreSQL cluster only, role clx_service_test, loopback port 55449, empty database service_suite. Then run the service suite with `--native`, followed by `node frontend/_admin_service_postgrest_tests.mjs` (temporary HTTP port 55450). Do not reuse a populated database for bootstrap tests. Neither suite accepts remote database environment configuration or reads production credentials. Test auth users/JWTs are isolated fixtures only.

Local PostgreSQL and PostgREST processes were stopped after verification.

## Next pair (not executed)

Step 5: predeployment review and separately controlled migration deployment.
Step 6: live public services catalogue integration and production-safe verification; booking remains deferred.
