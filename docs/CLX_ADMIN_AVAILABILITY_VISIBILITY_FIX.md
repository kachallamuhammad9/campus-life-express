# CLX admin availability defect — diagnosis and verification

Date: 2026-09-17
Status: Deployed and verified on https://clx.dandalinsauki.com/admin

## Root cause and actual UI

The administrator was using **Admin Console → Archive & Delete Management → Products**, rendered by `frontend/js/admin-lifecycle.js` and mounted as `#admin-lifecycle-section` in `frontend/admin.html`.

That renderer fetched only `id,name,is_active,created_at` for products. It never fetched `is_in_stock`, displayed availability, or rendered a stock action. Its product rows offered only Archive/Restore and Delete.

The previously implemented availability controls belonged to `frontend/js/admin-products.js`, a separate **Product Management** section (`#admin-products-section`) whose product table requires vendor and campus selection. Both factories were imported, mounted, and initialized after admin authorization.

The previous live deployment was `dpl_32TvXZVuQ3miP7UFj5GekY6E7tAe`, with `/assets/admin-COdDZskj.js`. Read-only retrieval confirmed it included both the separate stock controls and the lifecycle renderer without them. This was a component coverage defect, not a missing import, CSS hiding, or stale deployment.

| Question | Finding |
| --- | --- |
| A: admin-products.js controls another section | Yes: vendor/campus-filtered Product Management. |
| B: admin-lifecycle.js renders the visible rows | Yes: Archive & Delete Management → Products. |
| C: existing control not mounted | It was mounted in another section, absent from lifecycle rows. |
| D: relevant file not imported/executed | No: both modules were imported and initialized. |
| E: CSS or conditional hiding | No lifecycle control existed to hide; the other section requires filter selection. |
| F: stale or incorrect production bundle | No: the live bundle exhibited the source mismatch. |
| G: action exists in another Admin section | Yes: Product Management. |

## Implemented changes

- `frontend/js/admin-lifecycle.js`: reads canonical `is_in_stock` and vendor IDs, renders vendor and availability on active product rows, adds Edit and Mark Out of Stock/Mark Available beside Archive/Delete, and uses the existing `adminUpdateProduct` wrapper. Handles RPC product-row responses, errors, authoritative refresh, and Escape cancellation.
- `frontend/js/admin-products.js`: exposes the existing populated editor for lifecycle rows and a refresh method, retains the edited row for minimal patches, and notifies the lifecycle view after successful changes.
- `frontend/admin.html`: connects lifecycle Edit to the existing product editor and refreshes both views after product updates.
- `frontend/_admin_lifecycle_availability_browser_tests.mjs`: new browser regression tests using the actual admin factory wiring and local Rice fixtures. External requests are blocked.
- `frontend/_admin_product_management_tests.mjs`: updates the factory contract assertion for the shared editor/refresh methods.
- `frontend/_product_availability_hardening_tests.mjs`: explicitly requires the lifecycle availability query, labels, and secure update path.
- This report.

Two existing product-management surfaces remain; no third UI or parallel availability system was created. The lifecycle rows now provide the complete ordinary operational actions, and Edit opens the same editor used by Product Management.

## Production backend verification — read-only

Project: `bdjfkuddpupqaswzkrth` (CLX).

Catalog queries verified:

- `products.is_active` and `products.is_in_stock` are non-null boolean columns, default true.
- `admin_update_product(uuid,jsonb)` is SECURITY DEFINER with a fixed search path, requires a non-null `auth.uid()` and `public.is_admin()`, allowlists and validates `is_in_stock`, locks the product row, validates vendor/campus eligibility, and returns the authoritative updated product.
- `is_admin()` checks the database `user_roles` table for ADMIN/SUPER_ADMIN, not user-editable metadata.
- API roles anon/authenticated have SELECT only on products; RLS remains enabled.
- `create_customer_order` locks the product row and rejects inactive or out-of-stock products with PRODUCT_UNAVAILABLE before creating orders, payment records, or delivery requests. Existing stock-quantity validation also remains.

No database, RPC, RLS, grant, credential, or public-endpoint changes were necessary or made. Zero stock quantity continues to force Out of Stock in the existing RPC; use Edit to adjust stock quantity when replenishing. The UI displays the returned server state.

## Verification

31 selected frontend regression suites passed. This includes the local PGlite product management suite (173 checks), service management suite (91 checks), existing product browser suite (10 checks), lifecycle suite (10 checks), availability hardening suite (9 checks), and the new lifecycle browser suite (8 checks), plus auth, catalogue, cart, checkout, order, payment, vendor, and related operations regressions. Native PostgreSQL/PostgREST runtime suites were not run for this frontend-only fix.

The new browser suite verifies:

1. Active/in-stock and active/out-of-stock lifecycle rows show their respective visible actions without selecting vendor/campus filters; archived rows retain Restore/Delete.
2. Cancel and Escape make no mutation calls.
3. Mark Out of Stock calls `admin_update_product` with `{p_product_id:'p',p_patch:{is_in_stock:false}}` and refreshes both views.
4. Mark Available sends the corresponding true patch and preserves `is_active`.
5. Authorization failure leaves availability unchanged and displays an error.
6. Lifecycle Edit reuses the existing populated editor, saves only changed fields, and refreshes the lifecycle row.
7. A zero-stock server response is displayed honestly as Out of Stock.
8. Mobile buttons remain visible and the browser reports no runtime exceptions.

`npm.cmd run lint`, `npm.cmd run build`, and `vercel.cmd build --prod --yes` passed. The initial sandboxed esbuild attempt was blocked by filesystem access; the authorized build succeeded outside that sandbox. An existing exact-method-list test was updated for the new editor contract and rerun successfully.

All 22 production HTML page shells matched the local build apart from generated asset hashes before deployment. The packaged static output was checked for the lifecycle renderer, both labels, stock query, RPC path, and absence of credential files or actual secret/service-role keys.

## Deployment and live evidence

- Existing Vercel project: `frontend` (`prj_JEpByxirGFvjQPDquDnYpZW2ZG07`).
- Target: production. Status: READY.
- Deployment: `dpl_2ZXweMbDbCJjf5pAF3Uq9Uhutgh3`.
- Deployment URL: https://frontend-3nn2c03hd-kachallamuhammad9-1299s-projects.vercel.app
- Alias: https://clx.dandalinsauki.com
- Framework: Vite 6.4.3. Vercel build's Vite phase: 1.44 seconds.
- Git base: `4c65cfb`; deployment used the tested local working tree, including prior uncommitted work. No commit was created.
- Read-only live verification: 2026-09-17T09:28:10.428Z.
- `/admin`: HTTP 200.
- New live asset: `/assets/admin-DDtAaXv9.js`, HTTP 200.
- SHA-256: `6c6a68ae600d4426bfaa0937e0f68329a21836cfd08e30d63aee288e4093bd8a`.
- Live asset was byte-identical to the packaged production build.
- Verified the same asset contains `Archive & Delete Management`, `data-lifecycle-product`, `Current availability:`, `data-action="availability"`, `Mark Out of Stock`, `Mark Available`, the expanded product query, and `admin_update_product`.
- Loaded the actual production HTML and compiled assets in Chromium with mocked local auth/product responses. Both buttons rendered inside `#admin-lifecycle-section`, with no page exceptions. All Supabase requests were intercepted, so this was deployed-code rendering verification, not a live authenticated product mutation test.

Evidence files (local, ignored build/test artifacts):

- `frontend/.vercel/lifecycle-production-verification.json`
- `frontend/.vercel/lifecycle-availability-mobile.png`
- `frontend/.vercel/lifecycle-deployed-bundle-fixtures.png`
- `frontend/.vercel/_*tests.log`

No production product availability was changed automatically. All click tests used mocked data; production database access was limited to catalog/function/permission reads. Production observability drains were not inspected; browser verification reported no runtime exceptions.
