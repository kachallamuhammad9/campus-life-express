# CLX First Real Customer Runbook

Preparation document only. This runbook is not approval to contact a customer or start a pilot. Use it only after the CEO Manual Pilot Approval Gate is completed.

## Before Start

Check every item. If a critical prerequisite fails: **DO NOT START**.

- [ ] CLX frontend loads at `https://clx.dandalinsauki.com`.
- [ ] Admin dashboard loads and the authorized operator can access Operations.
- [ ] Official WhatsApp Business is available: `+2349150736638`.
- [ ] Selected vendor is reachable and has personally confirmed participation.
- [ ] Selected item is practically available now.
- [ ] Current authoritative price is checked.
- [ ] Operator is available through collection.
- [ ] Approved payment details are available internally.
- [ ] Customer understands this is a controlled pickup-first pilot.
- [ ] No unresolved HIGH or CRITICAL incident exists.
- [ ] Incident Log and Observation Log are ready.
- [ ] No delivery/rider testing is planned.

## Customer Checkout

The customer:

1. Opens CLX.
2. Selects University of Maiduguri.
3. Finds the agreed test product.
4. Adds it to the cart.
5. Reviews the cart.
6. Opens checkout.
7. Keeps **PICKUP** selected.
8. Enters the correct name.
9. Enters the correct phone number.
10. Reviews the total.
11. Submits once.

Do not submit a second time because a screen appears slow. Check the order state first.

## Order Creation Verification

The operator verifies in Admin > Operations:

- order number exists;
- the order appears in Admin;
- fulfillment is `PICKUP`;
- customer is correct;
- vendor is correct;
- item and quantity are correct;
- price and total are correct;
- payment is `PENDING`;
- no delivery request exists.

If any mismatch exists: **STOP**. Do not verify payment. Record an incident.

## WhatsApp Handoff

Confirm the customer reaches the official number:

`+2349150736638`

The handoff should contain the CLX order number, customer, pickup mode, vendor, item, quantity, and total. It must not contain internal UUIDs or tracking secrets. Do not send messages before approval.

## Payment

Send only the approved payment instructions through the official channel:

`[OFFICIAL CLX PAYMENT DETAILS]`

The customer sends evidence. The operator independently verifies the actual receipt and amount against the order total. A screenshot alone is insufficient if the receipt cannot be independently confirmed.

Only after real confirmation use **Verify Payment**.

Expected:

- payment `PAID`;
- parent `PAYMENT_CONFIRMED`.

Do not alter historical totals.

## Vendor Workflow

Contact the vendor manually and provide only:

- CLX order number;
- item;
- quantity;
- necessary pickup/item note.

Do not expose unnecessary customer data.

After explicit vendor acceptance:

`PENDING -> CONFIRMED`

When actual preparation starts:

`CONFIRMED -> PREPARING`

When the item is physically ready:

`PREPARING -> READY`

Expected parent state:

`READY_FOR_PICKUP`

## Customer Pickup

Notify the customer with the confirmed pickup location, vendor instruction, order number, and simple collection instruction.

After actual collection, confirm the item was handed over and no unresolved complaint exists. Only then select **Complete Pickup Order**.

Expected final state:

`COMPLETED`

## Final Tracking Check

Use the customer-approved tracking access method and verify the order reaches `COMPLETED`. Confirm that no private/internal fields are shown.

## Feedback

Ask:

1. Was ordering easy?
2. Was WhatsApp communication clear?
3. Was payment clear?
4. Was tracking understandable?
5. Was pickup easy?
6. What should CLX improve?

## Post-Order Review

Record:

- completed: `YES` / `NO`;
- checkout issue;
- WhatsApp issue;
- payment issue;
- admin issue;
- vendor issue;
- tracking issue;
- pickup issue;
- customer feedback;
- incident IDs;
- whether developer intervention was required.

## First Real Order Pass Criteria

The first order passes only if:

- correct order persisted;
- correct total;
- fulfillment is `PICKUP`;
- payment was safely verified;
- vendor workflow succeeded;
- tracking worked;
- pickup completed;
- no privacy or security defect occurred;
- no direct database intervention was used;
- no developer intervention was needed.

If developer or database intervention is required:

`OPERATIONALLY FAILED — TECHNICAL INTERVENTION REQUIRED`

## Stop Conditions

Stop immediately for:

- wrong total;
- wrong vendor;
- duplicate order;
- wrong customer/order relationship;
- payment mismatch;
- admin workflow failure;
- vendor unable to fulfill after payment;
- tracking failure;
- unexpected delivery request;
- customer/private data exposure;
- inconsistent state.

Do not improvise database fixes during a real transaction.
