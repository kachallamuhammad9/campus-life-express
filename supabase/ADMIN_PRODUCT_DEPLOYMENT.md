# Phase 4E.3 — 0029 production deployment

2026-09-09: **PASS — 0029 DEPLOYED AND VERIFIED**.

Project: `bdjfkuddpupqaswzkrth`, confirmed from supabase/.temp/project-ref.
Approved SHA-256 matched before any production action and was checked again
immediately before deployment:
`4022ff9a11628b8941803e72891d4151c16b7d546c5a765c3eaa6e4596246f77`.
The migration was not edited.

## Worktree and execution

The checkout already had many modified frontend pages, JS/config/package files,
and untracked tests, scripts, backend QA outputs and migrations 0024–0029.
No cleanup, staging, commit or unrelated file deployment occurred. Database
migration history, not git tracking, established the sole pending migration.

Before: local/remote aligned through 0028; only local 0029 pending; no 0030+.
Dry run: `supabase db push --linked --skip-vault --dry-run` listed only
0029_admin_product_management.sql, with empty seeds and roles lists.

Deployment: `supabase db push --linked --skip-vault --yes`.
Vault changes were explicitly skipped. No include-all, include-seed, include-roles,
reset or destructive flags were used. CLI confirmed only 0029 applied.
Immediately afterward, `supabase migration list --linked` confirmed alignment
through 0029, with no unexpected migrations.

## Read-only function/security verification

All three intended functions exist, owned by postgres, with no unexpected overloads:

- admin_create_product(uuid,uuid,uuid,text,bigint,text,uuid,bigint,text,boolean,integer)
  returns jsonb. First five parameters required; description/subcategory/original
  price/image/quantity default NULL and is_in_stock defaults TRUE.
- admin_update_product(uuid,jsonb) returns jsonb, no default arguments.
- _admin_product_image_url(text) returns text, internal helper.

Both mutation RPCs are SECURITY DEFINER with search_path pg_catalog, public,
pg_temp. Auth.uid() and is_admin() checks confirmed in stored bodies. PUBLIC/anon
EXECUTE false; authenticated/service_role EXECUTE true. Helper is SECURITY INVOKER,
search_path pg_catalog, pg_temp, with EXECUTE false for PUBLIC, anon, authenticated
and service_role. No mutation function or helper was invoked for verification.

Stored function bodies exactly match the approved local bodies after CRLF
normalization (MD5): helper a9de5cbe4707ecf33cac4b4f21f38442;
create 0a05c1399bf48d40284fd4416ccec873; update 1a94335a97faaa8f53314e74f9faee8b.

Anon/authenticated table SELECT remains true. INSERT/UPDATE/DELETE/TRUNCATE/
REFERENCES/TRIGGER are false. No explicit column-level ACLs remain to bypass
table restrictions. RLS remains enabled. The three owner-write policies are gone;
products_select_public is the sole remaining products policy and is byte-equivalent
as metadata to its predeployment snapshot. Public visibility remains in-stock plus
active vendor, with existing owner/admin SELECT branches. No write probes were run.

## Before/after equality

Complete snapshot comparison: IDENTICAL, covering 11 table counts and whole-row
fingerprints, product column metadata, public SELECT policy and protected records.

| Table | Before = after |
| --- | ---: |
| products | 44 |
| services | 23 |
| vendors | 14 |
| vendor_campuses | 19 |
| user_roles | 24 |
| vendor_applications | 3 |
| customer_orders | 10 |
| orders | 18 |
| order_items | 24 |
| customer_order_payments | 10 |
| storage.buckets | 0 |

Product rows fingerprint: 2239a9de37b3f7a3aa8c17d6b0d0a701, unchanged.
Product column metadata fingerprint: 9228480e70edeca39d12e1531926db62, unchanged.

Protected applications: 0001/0002 remain PENDING with vendor_id NULL; 0003 remains
APPROVED with its same synthetic vendor link. All whole-row fingerprints match
the prior review and the immediate predeployment snapshot. Synthetic vendor remains
owner_user_id NULL, products 0, services 0; fingerprint unchanged.

Protected orders: CLX-2026-0001 remains ORDER_RECEIVED, fingerprint
1445d3265f8f26b7e8b12c5fc6b1303a; CLX-2026-0003 remains PAYMENT_CONFIRMED,
fingerprint 04477b9c65a21777e7240b60b4c7d9d0. All customer orders, vendor orders,
order items and customer payments also match their complete before/after hashes.

Unexpected data/schema side effects observed: none. Intended function/policy/grant
changes and migration history insertion are the deployment changes.
Production product mutations: **0**. Frontend/Vercel deployment: **NOT PERFORMED**.

## Recommendation

Proceed to **Phase 4E.3 — Controlled Production Admin Product Smoke Test** as a
separately authorized task. The smoke test was not performed automatically.
