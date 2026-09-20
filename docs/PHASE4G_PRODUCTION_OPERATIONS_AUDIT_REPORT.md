# PHASE 4G - PRODUCTION OPERATIONS AUDIT REPORT

## Overall Operational Readiness

**READY WITH FIXES**

The deployed customer and admin surfaces are usable for a controlled pickup pilot. One high-priority UX issue should be fixed before pilot: the checkout currently defaults to Delivery while the current operating model is pickup-first.

No production mutation was performed during this audit.

## Customer Journey

| Area | Result |
|---|---|
| Home and navigation | PASS - deployed pages returned HTTP 200 and navigation links resolved |
| Category surface | PASS - category cards rendered |
| Orders/tracking surface | PASS - tracking form and checkout surface rendered |
| Responsive widths | PASS - no horizontal overflow at 360, 390, 414, or 1440px |
| Console/network | PASS - no application console errors or failed first-party requests observed |
| Completed pickup tracking | PASS - existing completed pickup order rendered through repaired tracking RPC |
| Delivery | NOT SMOKE-TESTED - intentionally excluded from this phase |

## Catalogue

Read-only production catalogue audit:

- Total products: `45`
- Available products: `44`
- Out-of-stock products: `1`
- In-stock records with zero stock: `0`
- Available products attached to inactive/unverified vendors: `0`
- Obvious duplicate live listings: `0`
- Vendor and campus joins were present for available products.

The catalogue was not modified. The one unavailable product was not exposed as an available product by the live catalogue query path.

## Cart

Source and deployed-surface review confirms:

- quantity controls are present;
- cart quantities persist in local storage;
- vendor grouping and subtotals are calculated client-side;
- checkout item quantities are validated again by the server RPC;
- duplicate product IDs and quantities outside `1..50` are rejected.

No cart mutation was performed during this audit.

## Checkout

Server-side checkout validation is strong and was confirmed from the deployed function:

- active campus required;
- product existence, campus, vendor, category, stock, and quantity revalidated;
- authoritative price and totals calculated server-side;
- price changes rejected with `PRICE_CHANGED`;
- pickup creates no delivery request;
- persistence occurs before cart clearing in the frontend;
- submit button is disabled while checkout is in progress;
- tracking token is returned only in the checkout response and is not included in WhatsApp.

**Operational issue:** the checkout select lists Delivery first and defaults to Delivery, while the current CLX business workflow is pickup-first. Server safeguards prevent invalid persistence, but the default can cause customer/operator confusion.

## WhatsApp Handoff

The handoff format contains the order number, customer details, campus, fulfillment mode, vendor groups, items, quantities, subtotal, delivery fee, service fee, total, payment status, and customer note.

The configured destination is `+2349150736638`.

The message builder excludes tracking tokens, hashes, order UUIDs, child UUIDs, product UUIDs, rider data, and admin IDs.

A human CLX agent can understand the pickup order without opening the database.

## Admin Operations

Read-only deployed admin audit passed:

- admin login works;
- Operations queue loads all current orders;
- pickup, payment, vendor child state, totals, customer phone, and notes are visible;
- rider list correctly shows no riders;
- Add Rider form opens with name, phone, campus, active, and available fields;
- no Delete control is present;
- completed orders expose no illegal next action;
- payment and vendor actions are state-gated;
- mutation actions were not clicked on existing orders.

## Customer Tracking

The repaired production tracking RPC works for the retained completed pickup record.

Verified:

- order number visible;
- pickup mode visible;
- payment state understandable;
- completed state prominent;
- chronological history present;
- vendor progression present;
- no rider UUID, rider phone, tracking hash, admin ID, or privileged metadata exposed;
- invalid-token behavior rejects safely.

## Error States

Observed or source-verified:

- empty cart/order state is understandable;
- invalid tracking input fails safely;
- empty rider state is understandable;
- unavailable products are filtered from available catalogue data;
- unauthorized admin remains at the login gate;
- no network failure simulation was performed against production.

## Mobile

At 360px, 390px, and 414px:

- no horizontal body overflow was detected;
- tracking form remained present;
- checkout fields remained present;
- customer page content wrapped within the viewport;
- admin shell loaded at 390px without horizontal overflow.

Font requests were occasionally reported as browser-aborted third-party resource loads; no application API request failed.

## Security / Privacy

PASS:

- final source and `dist` secret scan passed;
- no service-role credential or database password was found in client assets;
- tracking hash is not returned;
- tracking output excludes internal rider and admin identifiers;
- Phase 4F RPCs retain `SECURITY DEFINER` and hardened search paths;
- anonymous execution is denied for admin fulfillment RPCs;
- no generic customer-order status mutation RPC exists;
- no rider-delete workflow exists;
- no delivery/rider smoke test was performed.

## Production Data Integrity

Current read-only counts:

- customer_orders: `12`
- orders: `20`
- order_items: `26`
- customer_order_payments: `12`
- customer_order_status_history: `36`
- delivery_requests: `5`
- delivery_zones: `15`
- riders: `0`
- products: `45`
- services: `24`
- vendors: `15`
- vendor_campuses: `20`
- vendor_applications: `4`
- service_requests: `6`

The increase from the Phase 4F closure baseline is attributable to pre-existing QA order `CLX-2026-0012`, labelled `Phase 4C payment verification smoke test`, not to this audit. It is a completed pickup order with one child, one item, one payment, and seven history rows. This should be reconciled in the QA-record inventory before pilot.

The Phase 4F smoke order `CLX-2026-0011` remains completed, paid, pickup, child ready, with no delivery request and no rider.

## Issues Table

| ID | Severity | Page/module | Issue | User impact | Recommended fix | Launch blocker |
|---|---|---|---|---|---|---|
| 4G-001 | HIGH | `orders.html` checkout | Delivery is the first/default fulfillment option although the current pilot model is pickup-first | Customer may select the wrong fulfillment mode or expect delivery operations that are not part of this pilot | Make Pickup the default for the pickup pilot, or add explicit pickup-first copy and confirmation before submission | YES |
| 4G-002 | MEDIUM | Production data operations | Counts include a later QA payment smoke order `CLX-2026-0012` beyond the prior Phase 4F closure baseline | Staff may misread QA records as customer workload during daily operations | Maintain a visible QA-order inventory and exclude QA records from operational reporting | NO |
| 4G-003 | LOW | Browser external assets | Some third-party font/icon requests were reported as aborted by the headless browser | Cosmetic fallback fonts/icons may appear briefly under constrained networks | Self-host critical fonts/icons or accept the current fallback behavior | NO |

### Must Fix Before Pilot

- Make pickup the clear default or require an explicit pickup confirmation for the pilot.
- Reconcile and label QA records, including `CLX-2026-0012`, in the operational reporting process.

### Can Fix During Pilot

- Improve empty and delayed-loading status copy in the admin Operations panel.
- Monitor third-party font/icon loading in real supported browsers.

### Nice to Have Later

- Self-host visual assets.
- Add a dedicated QA/test-order filter to Operations.
- Add richer operator search and incident recording.
