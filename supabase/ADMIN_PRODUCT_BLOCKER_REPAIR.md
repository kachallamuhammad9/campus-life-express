# Phase 4E.3 — 0029 blocker repair

> Subsequent [final re-review](ADMIN_PRODUCT_FINAL_REVIEW.md) passed for the same
> migration hash. Deployment has not been performed.

Completed 2026-09-09. **PASS — READY FOR 0029 RE-REVIEW**.
Local repair only; production mutations **0**. No deployment or live product RPC.

Repaired migration SHA-256:
`4022ff9a11628b8941803e72891d4151c16b7d546c5a765c3eaa6e4596246f77`.
0026–0028 still match accepted hashes. Linked history is aligned through 0028;
0029 is the sole pending migration, with no 0030+.

## Repairs

- Create subcategories now require an active child of the selected root, without
  the contradictory parent_id IS NULL predicate. Root validation stays unchanged.
- Every update validates final price 1–999999999 and nullable original price
  between final price and the same ceiling, before no-op return or database write.
  This includes description/image/category/name/stock-only and empty patches.
- Every update validates stock bounds and zero-quantity/out-of-stock consistency.
  Metadata-only edits of inconsistent legacy rows fail without modifying them.
  Explicit stock patches retain the established rule that quantity zero forces
  out-of-stock; this normalization never runs for unrelated metadata patches.
- Both RPCs call the same internal `_admin_product_image_url(text)` helper.

## URL strategy

The helper trims surrounding whitespace, maps blank/NULL to NULL, and caps URLs
at 2048 characters. It separates the HTTP/HTTPS scheme and authority, then validates
host labels and optional numeric port 1–65535. ASCII DNS labels (including punycode)
are bounded to 63 characters each and 253 total, without empty labels or leading/
trailing hyphens. Strict four-octet IPv4 syntax disallows leading-zero ambiguity,
then PostgreSQL's inet parser validates address ranges. Userinfo, backslashes,
embedded whitespace/control characters and malformed percent escapes are rejected.
There is no DNS lookup or network access. Raw Unicode hostnames and bracketed IPv6
are deliberately unsupported; use an ASCII/punycode DNS name or valid IPv4 host.

The helper is SECURITY INVOKER with pg_catalog, pg_temp search_path and no dynamic
SQL. EXECUTE is revoked from PUBLIC, anon, authenticated and service_role. Authorized
SECURITY DEFINER RPCs invoke it internally as their owner. Existing RPC signatures,
authorization, grants, write restrictions, SELECT policy, patch semantics, immutable
identity, slug generation, advisory locking, checkout and snapshots are preserved.

## Verification

| Gate | Result |
| --- | --- |
| Product SQL/module suite | 171/171 PASS (previously 112) |
| Product browser | 10/10 PASS |
| Full existing regression | 593 counted checks PASS, plus existing vendor-admin browser integration summary |
| Vendor admin | 75/75 PASS |
| Ownership | 24/24 PASS |
| Native PostgreSQL replay | 171/171 plus 15/15 review checks PASS |
| Actual PostgREST transport | 11/11 PASS |
| Lint / build | PASS / PASS |
| Build secret scan | 33 files, 0 findings; no secret values printed |

Negative legacy price/stock fixtures temporarily relax CHECK constraints ONLY in
the isolated test database, inside transactions that are rolled back. Savepoints
allow asserting the failed RPC left the complete row unchanged. No production
legacy rows were modified.

A fresh PostgreSQL 18.6 cluster at frontend/.vercel/phase4e3-repair/pgdata listened
only on 127.0.0.1:55439. Two independent connections reproduced overlapping lock
waits: same-name creation yielded one success and one clean rejection; colliding
slugs received distinct suffixes; conflicting renames yielded one success with
the losing row unchanged. All three pass after repair.

PostgREST 16.2 on loopback 55440 used local JWTs and the real frontend wrappers.
Named UUID/bigint/default inputs, JSONB null/absent/boolean semantics, authorization,
direct-write denial and public SELECT pass. Added checks cover valid child create,
malformed-host rejection in both RPCs, invalid legacy price metadata rejection,
and valid metadata price preservation. Explicit image null clearing still passes.
Both disposable servers were stopped after verification; test data/logs remain
under ignored local tooling. No production credentials are used by these harnesses.

The initial attempt to run the final PostgREST gate was rejected by automatic
approval review because of a session usage limit. After the user renewed the task,
the same isolated command succeeded; no gate remains blocked by that interruption.

## Production read-only evidence

Counts: products 44, services 23, vendors 14, vendor_campuses 19, user_roles 24,
vendor_applications 3. Synthetic vendor: products 0, services 0, owner_user_id NULL.

| Protected record | State | Unchanged fingerprint |
| --- | --- | --- |
| CLX-VA-2026-0001 | PENDING | f36a51823f10e257b3f4b76865475f9d |
| CLX-VA-2026-0002 | PENDING | 2228351299fac966ff868a506ff04435 |
| CLX-VA-2026-0003 | APPROVED | 7c98ea9a277c082a3238c6132618a189 |
| Synthetic vendor | owner NULL | dd57e575e3fd0c15431c0920897e4ba4 |

Recommendation: re-review this repaired migration hash. Do not deploy automatically.
