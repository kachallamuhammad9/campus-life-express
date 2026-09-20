# Phase 4E.2A ownership audit

0027 only drops NOT NULL from vendors.owner_user_id. NULL means CLX-managed,
without a vendor login. Existing non-NULL owners retain their profiles FK,
ON DELETE RESTRICT and one-vendor-per-owner UNIQUE constraint. No data is changed.

## Local dependency inventory

- `supabase/migrations/0004_vendors.sql` and its historical backend mirror:
  mandatory owner is the schema assumption repaired by 0027. Do not edit history.
- `0013_security_helper_functions.sql` (also mirrored under backend):
  `owns_vendor` rejects missing uid/vendor id and uses EXISTS with owner equality;
  `get_user_vendor_ids` returns no rows without uid and filters exact owner equality.
  NULL comparisons are UNKNOWN, never a WHERE match. Neither helper grants admin
  ownership. No helper repair is needed.
- `0015_rls_policies.sql` and its backend mirror: vendor public reads require
  ACTIVE or real ownership or admin. Vendor-campus, operating-hours, products,
  product-images, services/service-requests, orders/order-items ownership paths
  use owns_vendor. Admin, customer, rider and service-provider paths are separate.
  No NULL-owner fallback exists. Existing public catalogue visibility is unchanged.
  `0025` removes the legacy orders_admin_update policy; this bridge preserves that.
- `0010_functions_constraints_indexes.sql`: vendor updated_at is a row UPDATE
  trigger, not triggered by this ALTER. No ownership-trigger dependency found.
- `clx-backend/src/repositories/vendorRepository.js`: selects/returns owner id,
  no dereference or required-owner filtering. Public status filters remain.
- `adminRepository.js`: vendor list/detail use LEFT JOIN profiles; update returns
  nullable owner; user detail uses exact owner equality and an optional vendor.
- `gasRepository.js`: vendor reporting and export use LEFT JOIN profiles;
  nullable owner name/email do not remove the vendor.
- `clx-backend/src/services/adminService.js`: owner notification is explicitly
  guarded by existing.owner_user_id. Unowned vendors receive no owner notification.
- Frontend JS/HTML has no owner_user_id/ownerUserId or ownership-helper dependency.
- `supabase/qa/phase2-02-fixtures.sql`, backend `vendors.test.js`, `admin.test.js`,
  and `validate_phase18b4.js` use non-NULL owner fixtures; these remain valid.
  `phase2-01-schema.sql` only inventories helpers.
- Backend scripts `_tmp-find.js`, `find-temp-records.js` inspect owner data;
  `final-smoke-vendor-cleanup.js` uses owner equality for a related-record count.
  NULL will not match a seller. These operational scripts were not executed.
- `clx-backend/DATABASE_IMPLEMENTATION_SPECIFICATION.md` is an older design with
  NOT NULL ownership and proposed owner-lookup logic; it is not executable schema.
  `ARCHITECTURE_ANALYSIS.md` is also historical design. This document records the
  new nullable-owner decision without rewriting historical specifications.

No runtime dependency assumes a non-NULL owner without a guard. No policies,
helpers, profiles, roles, catalogue rows, orders or applications are modified.
Existing admin policies still permit admin management; this bridge does not
implement or claim to restrict future ownership assignment to a new RPC.

## Uniqueness and verification limits

The original constraint is ordinary UNIQUE, not NULLS NOT DISTINCT. PostgreSQL
allows multiple NULLs while rejecting duplicate non-NULL owners:
https://www.postgresql.org/docs/18/indexes-unique.html

`frontend/_vendor_ownership_tests.mjs` checks the actual migration/helper/policy
contracts and explicit SQL-null semantic models. It does not execute PostgreSQL
or prove production metadata. Predeploy review should verify the live constraint
still matches this local chain. This task does not access production.

## Future account linking (not implemented)

1. Vendor remains owner_user_id NULL until identity is verified by CLX.
2. Create or link a real auth user and corresponding profile after verification.
3. A separately reviewed admin RPC locks the vendor, checks identity and current
   ownership, and assigns that profile. Never infer ownership from similar names
   or silently replace an existing owner.
4. Retain UNIQUE so one profile cannot own multiple vendors. Review direct owner
   assignment permissions when introducing that RPC; no role/login is created here.

0027 is local only. Approval implementation will require a later migration number.
