# CLX Daily Operations SOP

## 1. Purpose

This procedure defines how CLX handles customer pickup orders from receipt through payment confirmation, vendor preparation, pickup readiness, and completion.

## 2. Official Operations Channel

Official WhatsApp Business: `+2349150736638`

All official customer payment instructions must be sent through this channel. Do not direct customers to an unofficial payment account.

## 3. Roles

- **CLX Admin/Agent:** reviews orders, confirms payments, coordinates vendors, updates order states, and communicates with customers.
- **Vendor:** confirms availability, accepts the order, prepares the item, and confirms when it is ready.
- **Customer:** pays through the official instructions and collects the order.

## 4. Order Lifecycle

`ORDER_RECEIVED` -> `PAYMENT_CONFIRMED` -> `ORDER_CONFIRMED` -> `PREPARING` -> `READY_FOR_PICKUP` -> `COMPLETED`

- **ORDER_RECEIVED:** CLX has received the order. Payment is not confirmed.
- **PAYMENT_CONFIRMED:** CLX has verified the payment amount and marked the payment paid.
- **ORDER_CONFIRMED:** the vendor child order has been accepted after payment confirmation.
- **PREPARING:** the vendor has started preparing the item.
- **READY_FOR_PICKUP:** the vendor has confirmed the item is physically ready.
- **COMPLETED:** the customer has collected the item and the handoff is complete.

## 5. New Order Procedure

1. Open **Admin > Operations**.
2. Confirm the CLX order number.
3. Check the customer name and phone.
4. Confirm the order is **PICKUP**.
5. Review vendor, item, quantity, and totals.
6. Confirm practical availability with the vendor when required.
7. Open or continue the customer WhatsApp conversation.
8. Send the official payment details manually.
9. Do not mark payment paid until payment is actually verified.

## 6. Payment Verification Procedure

- The customer sends payment evidence.
- CLX checks the actual payment record.
- The received amount must equal the order total.
- Confirm the correct CLX order number.
- Only then select **Verify Payment** in Operations.
- Do not verify from a screenshot alone when the payment cannot be confirmed.
- Never change order totals manually after payment.

## 7. Vendor Confirmation Procedure

After payment confirmation:

- Contact the vendor.
- Provide the CLX order number, item, quantity, and customer pickup expectation.
- Share only customer details needed for the handoff.
- Obtain vendor acceptance.
- Advance the child order to `CONFIRMED`.

## 8. Preparing Procedure

When the vendor starts preparing the item, advance the child order to `PREPARING`. Customer tracking updates from the recorded status history.

## 9. Ready for Pickup Procedure

Only advance the child order to `READY` after the vendor explicitly confirms the item is physically ready. The parent should become `READY_FOR_PICKUP`.

Notify the customer through WhatsApp with:

- CLX order number
- pickup location
- vendor and location instruction
- simple collection instruction

## 10. Pickup Completion Procedure

Before completion:

- Confirm the customer has collected the item.
- Confirm the vendor handoff occurred.
- Resolve any complaint first.

Then select **Complete Pickup Order**. The expected final state is `COMPLETED`.

Never mark an order completed merely because the vendor says it is ready.

## 11. Unavailable Item Before Payment

- Do not verify payment.
- Inform the customer.
- Suggest a replacement where appropriate.
- Do not silently substitute an item.
- Preserve the order record.
- Escalate cancellation handling manually until a formal cancellation workflow exists.

## 12. Unavailable Item After Payment

- Do not fake fulfillment.
- Do not advance the vendor status.
- Contact the customer immediately.
- Escalate to the CEO/admin.
- Record the incident.
- Resolve refund or replacement manually.
- Do not mark `COMPLETED` until genuinely resolved.

Automated refund handling is not implemented.

## 13. Customer Cancellation

Before payment:

- Stop processing.
- Do not verify payment.
- Record the note or incident manually.

After payment:

- Escalate.
- Do not perform an automated refund.
- Preserve payment and conversation evidence.

## 14. Wrong Payment Amount

- **Underpaid:** do not verify payment; contact the customer.
- **Overpaid:** do not alter the order total; escalate excess-amount handling manually.

## 15. Duplicate Order

Check the customer phone, items, timestamps, and order numbers. Do not delete records. Confirm with the customer which order is intended.

## 16. Vendor Does Not Respond

- Retry the vendor.
- Wait a reasonable operational period.
- Update the customer with the current status.
- Do not claim the order is preparing unless the vendor confirmed it.
- Escalate internally when needed.

No exact service-level deadline is defined in the current MVP.

## 17. Customer Does Not Collect

Keep the order at `READY_FOR_PICKUP`. Contact the customer. Do not mark `COMPLETED` until the item is collected. Escalate prolonged cases manually.

## 18. Complaint Handling

Record the order number, customer, issue, vendor, time, evidence, and resolution. Do not erase order history.

## 19. End-of-Day Checklist

- Review all `ORDER_RECEIVED` orders.
- Review all `PAYMENT_CONFIRMED` orders.
- Review all `ORDER_CONFIRMED` orders.
- Review all `PREPARING` orders.
- Review all `READY_FOR_PICKUP` orders.
- Confirm completed orders were genuinely collected.
- Review unresolved customer messages.
- Review incidents and vendor issues.
- Check suspicious duplicates.
- Ensure no paid order is abandoned.

## 20. Daily Safety Rules

- Never share admin credentials.
- Never share tracking tokens.
- Never send Supabase credentials.
- Never mark payment paid without confirmation.
- Never mark ready without vendor confirmation.
- Never mark completed before pickup.
- Never delete orders to hide mistakes.
- Never alter historical price snapshots.
- Never send a customer to an unofficial payment account.
- Never expose internal UUIDs to customers or vendors.

## 21. WhatsApp Message Templates

### Order received

Hello [Customer Name], CLX received order [CLX Order Number]. We are checking the vendor and will send the official payment instructions here.

### Payment details placeholder

For [CLX Order Number], please use the following approved payment instructions:

`[OFFICIAL CLX PAYMENT DETAILS]`

Please send your payment evidence here and include the CLX order number.

### Payment confirmed

Payment for [CLX Order Number] has been confirmed. We are now coordinating with [Vendor Name] for preparation and pickup.

### Vendor preparing

Your order [CLX Order Number] is being prepared by [Vendor Name]. We will notify you when it is ready for pickup.

### Ready for pickup

Order [CLX Order Number] is ready for pickup at [Pickup Location]. Please collect from [Vendor Name] and reference your CLX order number.

### Pickup completed

Thank you. Order [CLX Order Number] has been recorded as collected and completed.

### Item unavailable

We are sorry, but [Item] is currently unavailable for order [CLX Order Number]. We have not substituted it. Please let us know whether you prefer an approved replacement or manual escalation.

### Payment not yet confirmed

We have received your order [CLX Order Number], but payment is not yet confirmed. Please send the payment evidence through this official WhatsApp channel.

### Delay update

Order [CLX Order Number] is delayed while we coordinate with [Vendor Name]. We will update you when the next confirmed status is available.

### Cancellation escalation acknowledgement

We received your cancellation request for [CLX Order Number]. It has been escalated for review. Please do not make another payment while we investigate.

## 22. Incident Escalation

- **LOW:** minor delay or clarification request.
- **MEDIUM:** repeated vendor delay, customer complaint, or suspected duplicate order.
- **HIGH:** paid item unavailable, wrong vendor fulfillment, duplicate payment, or customer claims payment is missing.
- **CRITICAL:** suspected account compromise, unauthorized admin action, payment diversion/fraud, or privileged credential exposure.

## 23. Records to Preserve

Never delete an order, payment history, fulfillment history, complaint evidence, payment evidence, or incident notes. This remains subject to a future formal retention and privacy policy.
