# Phase 4E.3 — 0029 final re-review

> Subsequently [deployed and verified](ADMIN_PRODUCT_DEPLOYMENT.md) under explicit
> user authorization. The predeployment results below remain the reviewed evidence.

2026-09-09: **PASS — 0029 SAFE TO DEPLOY**.

This is a review decision, not execution authorization. 0029 remains local only.
No production DML, product mutation RPC, migration application or Vercel deployment
was performed. Production mutations: **0**.

## Exact reviewed artifact

Migration SHA-256 (unchanged during this re-review):
`4022ff9a11628b8941803e72891d4151c16b7d546c5a765c3eaa6e4596246f77`.

Linked history: local/remote aligned through 0028; only 0029 pending; no 0030+.
0026–0028 match the accepted hashes recorded in the earlier review. They were not
edited. The complete 0029 file was inspected: scope is two product RPCs, one private
URL helper and product write grants/policies. No orders/order_items/payments,
vendor applications, services, auth schema, role records or unrelated tables change.

## Repaired invariants

- Create accepts an active root plus optional active child of that root; rejects
  mismatched/inactive children, root-as-child and non-root category inputs.
- Every update validates final selling price 1–999999999 and nullable original
  price >= selling price and <=999999999, before no-op return or write.
- Every update validates nullable stock quantity 0–1000000 and zero implies false.
  Metadata/no-op changes on invalid legacy fixtures fail with unchanged rows.
  Only explicit stock patches invoke zero-quantity normalization.
- Shared URL helper separates scheme/authority, checks DNS labels or strict IPv4,
  optional port 1–65535, 2048-character ceiling, and percent-escape syntax. NULL/
  whitespace-only inputs normalize to NULL. Userinfo, missing hosts, invalid
  authority, unsupported schemes, relative paths, malformed encoding, whitespace
  and backslashes are rejected. All requested valid examples pass.
- URL limitations are deliberate and tested: no raw Unicode hosts or IPv6;
  ASCII/punycode DNS and strict IPv4 hosts are supported. No DNS/network lookup.
- Helper is SECURITY INVOKER with hardened search_path and no dynamic SQL.
  PUBLIC/anon/authenticated/service_role EXECUTE is revoked; RPCs call internally.

JSONB missing/null semantics and unknown/protected-key rejection remain intact.
Mutation RPCs remain SECURITY DEFINER with auth.uid()/is_admin() checks, hardened
search_path and existing authenticated/service_role grants. No browser-controlled
ID, slug, rating, review count, popularity, timestamps or vendor/campus mutation.
Vendor eligibility, campus and exact active association checks remain authoritative.
Product row locking, rename slug regeneration, duplicate advisory lock and UNIQUE
constraints remain intact. Checkout and historical snapshots are untouched.

Direct anon/authenticated/admin-browser writes are denied over SQL and HTTP.
TRUNCATE/REFERENCES/TRIGGER privileges are also absent. Public SELECT policy and
owner read helpers remain unchanged: visible products return, out-of-stock and
inactive-vendor rows are hidden from anon. Catalogue shape and kobo representation
are unchanged. Vendor self-management still requires a future explicit write design.

## Executed gates

| Gate | Final result |
| --- | --- |
| Product suite (PGlite) | 173/173 PASS |
| Product suite (native PostgreSQL) | 173/173 PASS |
| Additional native review checks | 15/15 PASS |
| Product browser | 10/10 PASS |
| Real PostgREST | 13/13 PASS |
| Full existing regression | 595 counted checks PASS, plus vendor-admin browser integration summary |
| Vendor application admin | 75/75 PASS |
| Ownership | 24/24 PASS |
| Lint | PASS |
| Build | PASS |
| Build secret scan | 33 files, 3 available private values checked, 0 findings |

The 595 total counts the normal frontend suites once, not the duplicate native
replay or extra native/PostgREST checks. All 16 normal suite processes exited 0.
Cart, catalogue, customer-order/checkout, payments, vendor operations, operations
dashboard, admin auth and onboarding checks pass. No secret values were printed.

A fresh native PostgreSQL 18.6 cluster was initialized in ignored workspace tooling
at frontend/.vercel/phase4e3-final/pgdata, bound to 127.0.0.1:55439. Actual overlapping
transactions use two independent connections plus lock-wait observation:

1. Same normalized creation: exactly one commits, competitor fails cleanly.
2. Slug collision: both receive distinct IDs and safe base/-2 slugs; no overwrite.
3. Conflicting rename: one succeeds, competitor fails and retains its original row.

Actual PostgREST 16.2 at loopback 55440 used local JWTs and the real frontend RPC
wrappers. Verified named UUID/bigint/null/boolean inputs, active child create,
mismatched child denial, valid URL acceptance, malformed-host rejection, explicit
nullable clearing, omitted nullable retention, invalid-price/stock metadata rejection,
normal metadata updates, auth gates, direct-write denial and permitted public SELECT.
Invalid-stock HTTP tests assert the entire row remains unchanged on rejection.
No production credentials or URLs are used by these isolated harnesses.

Both test servers were stopped after review. Logs and disposable data remain under
frontend/.vercel/phase4e3-final; they are excluded from the public build. Tests were
extended for the requested coverage; the migration and implementation were not edited.

## Production read-only confirmation

Products **44**, services **23**, vendors **14**, vendor_campuses **19**,
user_roles **24**, vendor_applications **3**. Synthetic vendor remains owner NULL,
products **0**, services **0**. Protected whole-row fingerprints match prior checks:

| Record | State | Fingerprint |
| --- | --- | --- |
| CLX-VA-2026-0001 | PENDING | f36a51823f10e257b3f4b76865475f9d |
| CLX-VA-2026-0002 | PENDING | 2228351299fac966ff868a506ff04435 |
| CLX-VA-2026-0003 | APPROVED | 7c98ea9a277c082a3238c6132618a189 |
| Synthetic vendor | owner NULL | dd57e575e3fd0c15431c0920897e4ba4 |

## Recommendation

All requested blocking gates pass for the exact hash above. Proceed only through
a separately authorized deployment step. Do not deploy automatically.
