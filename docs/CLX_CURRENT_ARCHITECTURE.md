# CLX Current Production Architecture

## System Context

```text
Customer
  ↓
CLX Web
  ↓
Supabase Auth / PostgreSQL / RPC
  ↓
Operational fulfilment

Admin
  ↓
CLX Admin Console
  ↓
Protected Supabase RPCs

CLX
  ↓
WhatsApp Business
  ↓
Customer and operations communication
```

CLX is the Dandalin Sauki LTD campus commerce and services platform. The current pilot serves the University of Maiduguri (UNIMAID).

## Frontend

`frontend/` is a Vite-built static multi-page application deployed on Vercel. Its browser modules use the Supabase client for live catalogue data, authentication, customer order functions, tracking, and authorized operational views and actions.

## Authentication

Customers and administrators authenticate through Supabase Auth. The frontend restores Supabase sessions and uses the authenticated user context; it does not embed privileged database credentials or administrator bypass keys.

## Authorization

Supabase RLS protects table access. Protected RPCs enforce server-side authorization, validation, locking, and lifecycle rules for operational changes. Customer-safe RPCs also exist, so operational RPC protection does not mean every RPC is administrator-only.

## Ordering

1. A customer builds a local cart.
2. Checkout submits authoritative item and customer data to the customer-order RPC.
3. The system creates one multi-vendor parent customer order and one child vendor order for each vendor group.
4. A payment record is associated with the parent order.
5. The order follows Pickup or Delivery fulfilment and customer tracking uses the returned safe tracking contract.

## Delivery

The UNIMAID delivery model is:

- Delivery fee: ₦200 (20,000 kobo)
- Pickup delivery fee: ₦0
- Delivery destination: an approved UNIMAID landmark plus the customer's exact delivery location

The obsolete delivery-zone checkout requirement is not part of the current model.

## Payment

Payment verification in the current MVP is operational and manual. Documentation must not describe automatic payment-gateway settlement unless that architecture is separately implemented and verified.

## Refund

CLX records a manual refund workflow. `REFUND_PENDING` does not mean money has already been returned. `REFUNDED` is recorded only after an operator confirms that money was returned; this is not an automatic gateway refund.

## WhatsApp

The official CLX WhatsApp Business number is **+2349150736638**. It supports customer order handoff and operations communication. Delivery handoff includes the fulfilment type, approved landmark, and exact location where applicable; it must not expose internal IDs or tracking secrets.

## Product Availability

Product publication and stock are separate concepts:

- `is_active` controls whether a product is active/published.
- `is_in_stock` controls whether an active product is presently purchasable.

Checkout revalidates availability instead of trusting stale client state.

## Deployment

- Frontend: Vercel
- Backend/data/auth: Supabase

Canonical database changes live in [`../supabase/migrations/`](../supabase/migrations/) and are applied forward-only after review.

## Legacy Architecture

`clx-backend/` contains the earlier Express/backend architecture, including Render- and Paystack-oriented material. It is retained for historical/reference purposes and is not part of the current production request path.
